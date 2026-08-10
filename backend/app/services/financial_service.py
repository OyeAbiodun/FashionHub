import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.business import Business
from app.models.finance import (
    Invoice,
    InvoiceCounter,
    InvoiceStatus,
    Payment,
    PaymentStatus,
)
from app.models.order import Order, OrderStatus
from app.models.user import User
from app.schemas.finance import (
    InvoiceBusinessResponse,
    InvoiceCreate,
    InvoiceCustomerResponse,
    InvoiceFinancialSummary,
    InvoiceItemResponse,
    InvoiceOrderResponse,
    InvoiceResponse,
    PaymentCreate,
    PaymentListItem,
    PaymentListResponse,
    PaymentResponse,
    total_pages,
)

ZERO = Decimal("0.00")


def user_name(user: User | None) -> str:
    if user is None:
        return ""
    return " ".join(part for part in [user.first_name, user.last_name] if part)


def customer_name(customer) -> str:
    return " ".join(part for part in [customer.first_name, customer.last_name] if part)


def sortable_datetime(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


async def tenant_order(session: AsyncSession, business: Business, order_id: uuid.UUID) -> Order:
    result = await session.execute(
        select(Order)
        .options(
            selectinload(Order.customer),
            selectinload(Order.items),
            selectinload(Order.payments).selectinload(Payment.received_by_user),
            selectinload(Order.invoice),
        )
        .where(Order.id == order_id, Order.business_id == business.id)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


def calculate_order_subtotal(order: Order) -> Decimal:
    return sum((item.unit_price * item.quantity for item in order.items), ZERO)


def calculate_order_total(order: Order) -> Decimal:
    return max(calculate_order_subtotal(order) - order.discount_amount, ZERO)


def calculate_successful_payments(order: Order) -> Decimal:
    return sum(
        (
            payment.amount
            for payment in order.payments
            if payment.status == PaymentStatus.SUCCESSFUL
        ),
        ZERO,
    )


def calculate_outstanding_balance(order: Order) -> Decimal:
    return max(calculate_order_total(order) - calculate_successful_payments(order), ZERO)


def calculate_invoice_status(order: Order, cancelled: bool = False) -> InvoiceStatus:
    if cancelled:
        return InvoiceStatus.CANCELLED
    total = calculate_order_total(order)
    amount_paid = calculate_successful_payments(order)
    if amount_paid >= total:
        return InvoiceStatus.PAID
    if amount_paid > ZERO:
        return InvoiceStatus.PARTIALLY_PAID
    return InvoiceStatus.ISSUED


def payment_response(payment: Payment) -> PaymentResponse:
    return PaymentResponse(
        id=payment.id,
        order_id=payment.order_id,
        customer_id=payment.customer_id,
        amount=payment.amount,
        payment_method=payment.payment_method,
        status=payment.status,
        reference=payment.reference,
        notes=payment.notes,
        received_by=payment.received_by,
        received_by_name=user_name(payment.received_by_user),
        paid_at=payment.paid_at,
        created_at=payment.created_at,
    )


async def record_payment(
    session: AsyncSession,
    business: Business,
    current_user: User,
    order_id: uuid.UUID,
    payload: PaymentCreate,
) -> Payment:
    locked_id = (
        await session.execute(
            select(Order.id)
            .where(Order.id == order_id, Order.business_id == business.id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if locked_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    order = await tenant_order(session, business, order_id)
    if order.status == OrderStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cancelled orders cannot receive payments.",
        )
    outstanding = calculate_outstanding_balance(order)
    if payload.amount > outstanding:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Payment exceeds the outstanding balance of {outstanding:.2f}.",
        )
    payment = Payment(
        business_id=business.id,
        order_id=order.id,
        customer_id=order.customer_id,
        amount=payload.amount,
        payment_method=payload.payment_method,
        status=PaymentStatus.SUCCESSFUL,
        reference=payload.reference,
        notes=payload.notes,
        received_by=current_user.id,
        paid_at=payload.paid_at or datetime.now(UTC),
    )
    session.add(payment)
    try:
        await session.flush()
        order.payments.append(payment)
        if order.invoice is not None and order.invoice.status != InvoiceStatus.CANCELLED:
            order.invoice.status = calculate_invoice_status(order)
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    result = await session.execute(
        select(Payment)
        .options(selectinload(Payment.received_by_user))
        .where(Payment.id == payment.id, Payment.business_id == business.id)
    )
    return result.scalar_one()


async def list_order_payments(
    session: AsyncSession, business: Business, order_id: uuid.UUID
) -> list[PaymentResponse]:
    await tenant_order(session, business, order_id)
    result = await session.execute(
        select(Payment)
        .options(selectinload(Payment.received_by_user))
        .where(Payment.business_id == business.id, Payment.order_id == order_id)
        .order_by(Payment.paid_at.desc(), Payment.created_at.desc())
    )
    return [payment_response(payment) for payment in result.scalars().all()]


async def list_customer_payments(
    session: AsyncSession,
    business: Business,
    customer_id: uuid.UUID,
    page: int,
    page_size: int,
) -> PaymentListResponse:
    from app.services.customer_service import get_customer

    await get_customer(session, business, customer_id)
    filters = (Payment.business_id == business.id, Payment.customer_id == customer_id)
    total = (
        await session.execute(select(func.count()).select_from(Payment).where(*filters))
    ).scalar_one()
    result = await session.execute(
        select(Payment)
        .options(selectinload(Payment.received_by_user), selectinload(Payment.order))
        .where(*filters)
        .order_by(Payment.paid_at.desc(), Payment.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return PaymentListResponse(
        items=[
            PaymentListItem(
                **payment_response(payment).model_dump(), order_number=payment.order.order_number
            )
            for payment in result.scalars().all()
        ],
        page=page,
        page_size=page_size,
        total=total,
        total_pages=total_pages(total, page_size),
    )


async def generate_invoice_number(session: AsyncSession, business: Business) -> str:
    await session.execute(select(Business.id).where(Business.id == business.id).with_for_update())
    counter = await session.get(InvoiceCounter, business.id, with_for_update=True)
    if counter is None:
        counter = InvoiceCounter(business_id=business.id, next_number=1)
        session.add(counter)
        await session.flush()
    number = counter.next_number
    counter.next_number += 1
    return f"INV-{number:06d}"


async def create_invoice(
    session: AsyncSession,
    business: Business,
    current_user: User,
    order_id: uuid.UUID,
    payload: InvoiceCreate,
) -> Invoice:
    locked_id = (
        await session.execute(
            select(Order.id)
            .where(Order.id == order_id, Order.business_id == business.id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if locked_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    order = await tenant_order(session, business, order_id)
    if order.status == OrderStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cancelled orders cannot be invoiced.",
        )
    if not order.items:
        raise HTTPException(status_code=422, detail="An invoice requires at least one order item.")
    if order.invoice is not None:
        raise HTTPException(status_code=409, detail="An invoice already exists for this order.")
    invoice = Invoice(
        business_id=business.id,
        order_id=order.id,
        customer_id=order.customer_id,
        invoice_number=await generate_invoice_number(session, business),
        status=calculate_invoice_status(order),
        issued_at=datetime.now(UTC),
        due_date=payload.due_date or order.due_date,
        notes=payload.notes,
        created_by=current_user.id,
    )
    session.add(invoice)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=409, detail="An invoice already exists for this order."
        ) from exc
    except Exception:
        await session.rollback()
        raise
    return await get_invoice(session, business, invoice.id)


async def get_invoice(session: AsyncSession, business: Business, invoice_id: uuid.UUID) -> Invoice:
    result = await session.execute(
        select(Invoice)
        .options(
            selectinload(Invoice.business),
            selectinload(Invoice.customer),
            selectinload(Invoice.order).selectinload(Order.items),
            selectinload(Invoice.order)
            .selectinload(Order.payments)
            .selectinload(Payment.received_by_user),
        )
        .where(Invoice.id == invoice_id, Invoice.business_id == business.id)
    )
    invoice = result.scalar_one_or_none()
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    derived = calculate_invoice_status(invoice.order, invoice.status == InvoiceStatus.CANCELLED)
    if invoice.status != derived:
        invoice.status = derived
        await session.commit()
    return invoice


async def get_order_invoice(
    session: AsyncSession, business: Business, order_id: uuid.UUID
) -> Invoice:
    await tenant_order(session, business, order_id)
    invoice_id = (
        await session.execute(
            select(Invoice.id).where(
                Invoice.order_id == order_id, Invoice.business_id == business.id
            )
        )
    ).scalar_one_or_none()
    if invoice_id is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return await get_invoice(session, business, invoice_id)


def invoice_response(invoice: Invoice) -> InvoiceResponse:
    order = invoice.order
    payments = sorted(
        order.payments, key=lambda value: sortable_datetime(value.paid_at), reverse=True
    )
    return InvoiceResponse(
        id=invoice.id,
        invoice_number=invoice.invoice_number,
        status=calculate_invoice_status(order, invoice.status == InvoiceStatus.CANCELLED),
        issued_at=invoice.issued_at,
        due_date=invoice.due_date,
        notes=invoice.notes,
        created_at=invoice.created_at,
        business=InvoiceBusinessResponse(
            name=invoice.business.name,
            phone=invoice.business.phone,
            email=invoice.business.email,
            address=invoice.business.address,
            logo_url=invoice.business.logo_url,
            currency=invoice.business.currency,
            timezone=invoice.business.timezone,
            invoice_notes=invoice.business.invoice_notes,
            invoice_footer=invoice.business.invoice_footer,
        ),
        customer=InvoiceCustomerResponse(
            id=invoice.customer.id,
            name=customer_name(invoice.customer),
            phone=invoice.customer.phone,
            email=invoice.customer.email,
            address=invoice.customer.address,
        ),
        order=InvoiceOrderResponse(
            id=order.id,
            order_number=order.order_number,
            order_date=order.order_date,
            due_date=order.due_date,
        ),
        items=[
            InvoiceItemResponse(
                garment_type=item.garment_type,
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=item.unit_price * item.quantity,
            )
            for item in sorted(order.items, key=lambda value: value.position)
        ],
        financial_summary=InvoiceFinancialSummary(
            subtotal=calculate_order_subtotal(order),
            discount_amount=order.discount_amount,
            total=calculate_order_total(order),
            amount_paid=calculate_successful_payments(order),
            outstanding_balance=calculate_outstanding_balance(order),
        ),
        payments=[payment_response(payment) for payment in payments],
    )
