import uuid
from datetime import UTC, date, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.timezone import business_today
from app.models.business import Business
from app.models.customer import Customer
from app.models.finance import Payment
from app.models.measurement import MeasurementProfile
from app.models.order import Order, OrderCounter, OrderItem, OrderStatus, OrderStatusHistory
from app.models.user import User
from app.schemas.order import (
    FinancialStatus,
    OrderCreate,
    OrderCustomerSummary,
    OrderDetailResponse,
    OrderItemResponse,
    OrderListItem,
    OrderListResponse,
    OrderStatusHistoryResponse,
    OrderStatusUpdate,
    OrderUpdate,
    total_pages,
)
from app.services.customer_service import get_customer, normalize_phone
from app.services.financial_service import (
    calculate_invoice_status,
    calculate_order_subtotal,
    calculate_order_total,
    calculate_outstanding_balance,
    calculate_successful_payments,
)

ORDER_TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.DRAFT: {OrderStatus.CONFIRMED, OrderStatus.CANCELLED},
    OrderStatus.CONFIRMED: {OrderStatus.CUTTING, OrderStatus.CANCELLED},
    OrderStatus.CUTTING: {OrderStatus.SEWING, OrderStatus.CANCELLED},
    OrderStatus.SEWING: {OrderStatus.FITTING, OrderStatus.FINISHING, OrderStatus.CANCELLED},
    OrderStatus.FITTING: {OrderStatus.SEWING, OrderStatus.FINISHING, OrderStatus.CANCELLED},
    OrderStatus.FINISHING: {OrderStatus.READY, OrderStatus.CANCELLED},
    OrderStatus.READY: {OrderStatus.DELIVERED, OrderStatus.FINISHING, OrderStatus.CANCELLED},
    OrderStatus.DELIVERED: set(),
    OrderStatus.CANCELLED: set(),
}
TERMINAL_STATUSES = {OrderStatus.DELIVERED, OrderStatus.CANCELLED}


def calculate_overdue(order: Order, today: date) -> tuple[bool, int]:
    if order.status in TERMINAL_STATUSES or order.due_date >= today:
        return False, 0
    return True, (today - order.due_date).days


def user_name(user: User | None) -> str:
    if user is None:
        return ""
    return " ".join(part for part in [user.first_name, user.last_name] if part)


def customer_name(customer: Customer) -> str:
    return " ".join(part for part in [customer.first_name, customer.last_name] if part)


def sortable_datetime(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def garment_summary(items: list[OrderItem]) -> str:
    names = [item.garment_type for item in sorted(items, key=lambda item: item.position)]
    if len(names) <= 2:
        return ", ".join(names)
    return f"{names[0]}, {names[1]} +{len(names) - 2} more"


async def generate_order_number(session: AsyncSession, business: Business) -> str:
    await session.execute(select(Business.id).where(Business.id == business.id).with_for_update())
    counter = await session.get(OrderCounter, business.id, with_for_update=True)
    if counter is None:
        counter = OrderCounter(business_id=business.id, next_number=1)
        session.add(counter)
        await session.flush()
    number = counter.next_number
    counter.next_number += 1
    return f"ORD-{number:06d}"


async def validate_measurement_profile(
    session: AsyncSession,
    business: Business,
    customer_id: uuid.UUID,
    profile_id: uuid.UUID,
) -> MeasurementProfile:
    result = await session.execute(
        select(MeasurementProfile).where(
            MeasurementProfile.business_id == business.id,
            MeasurementProfile.id == profile_id,
        )
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Measurement profile not found",
        )
    if profile.customer_id != customer_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Measurement profile must belong to the order customer.",
        )
    if profile.archived_at is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Archived measurement profiles cannot be used for new orders.",
        )
    return profile


async def create_order(
    session: AsyncSession,
    business: Business,
    current_user: User,
    payload: OrderCreate,
) -> Order:
    customer = await get_customer(session, business, payload.customer_id)
    if customer.archived_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Archived customers cannot receive new orders.",
        )
    profiles: dict[uuid.UUID, MeasurementProfile] = {}
    for item in payload.items:
        if item.measurement_profile_id is not None:
            profiles[item.measurement_profile_id] = await validate_measurement_profile(
                session, business, customer.id, item.measurement_profile_id
            )

    order = Order(
        business_id=business.id,
        customer_id=customer.id,
        order_number=await generate_order_number(session, business),
        status=payload.status,
        order_date=payload.order_date,
        due_date=payload.due_date,
        notes=payload.notes,
        discount_amount=payload.discount_amount,
        created_by=current_user.id,
    )
    for index, item in enumerate(payload.items, start=1):
        order.items.append(
            OrderItem(
                garment_type=item.garment_type.strip(),
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                measurement_profile_id=item.measurement_profile_id,
                style_reference_url=item.style_reference_url,
                notes=item.notes,
                status=payload.status if payload.status not in TERMINAL_STATUSES else None,
                position=item.position or index,
            )
        )
    order.status_history.append(
        OrderStatusHistory(
            previous_status=None,
            new_status=payload.status,
            changed_by=current_user.id,
            notes="Order created.",
            changed_at=datetime.now(UTC),
        )
    )
    session.add(order)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    return await get_order(session, business, order.id)


def _search_filter(query: Select[tuple[Order]], search: str | None) -> Select[tuple[Order]]:
    if not search:
        return query
    search_term = f"%{search.strip().lower()}%"
    phone_term = f"%{normalize_phone(search)}%"
    return query.where(
        or_(
            func.lower(Order.order_number).like(search_term),
            func.lower(Customer.first_name).like(search_term),
            func.lower(Customer.last_name).like(search_term),
            Customer.phone_normalized.like(phone_term),
            func.lower(OrderItem.garment_type).like(search_term),
            func.lower(OrderItem.description).like(search_term),
        )
    )


def _due_filter(query: Select[tuple[Order]], due: str | None, today: date) -> Select[tuple[Order]]:
    if due == "today":
        return query.where(Order.due_date == today)
    if due == "tomorrow":
        return query.where(Order.due_date == today + timedelta(days=1))
    if due == "this_week":
        return query.where(Order.due_date >= today, Order.due_date <= today + timedelta(days=7))
    if due == "overdue":
        return query.where(
            Order.due_date < today,
            Order.status.notin_([OrderStatus.DELIVERED, OrderStatus.CANCELLED]),
        )
    if due == "upcoming":
        return query.where(
            Order.due_date >= today,
            Order.status.notin_([OrderStatus.DELIVERED, OrderStatus.CANCELLED]),
        )
    return query


async def list_orders(
    session: AsyncSession,
    business: Business,
    search: str | None,
    statuses: list[OrderStatus] | None,
    due: str | None,
    customer_id: uuid.UUID | None,
    page: int,
    page_size: int,
) -> OrderListResponse:
    today = business_today(business)
    base_query = (
        select(Order)
        .join(Order.customer)
        .outerjoin(Order.items)
        .where(Order.business_id == business.id)
        .options(selectinload(Order.customer), selectinload(Order.items))
        .options(selectinload(Order.payments))
        .distinct()
    )
    if customer_id is not None:
        await get_customer(session, business, customer_id)
        base_query = base_query.where(Order.customer_id == customer_id)
    if statuses:
        base_query = base_query.where(Order.status.in_(statuses))
    base_query = _due_filter(_search_filter(base_query, search), due, today)

    total_query = select(func.count()).select_from(base_query.order_by(None).subquery())
    total = (await session.execute(total_query)).scalar_one()
    result = await session.execute(
        base_query.order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    orders = list(result.scalars().unique().all())
    return OrderListResponse(
        items=[order_list_item(order, today) for order in orders],
        page=page,
        page_size=page_size,
        total=total,
        total_pages=total_pages(total, page_size),
    )


async def get_order(session: AsyncSession, business: Business, order_id: uuid.UUID) -> Order:
    result = await session.execute(
        select(Order)
        .options(
            selectinload(Order.customer),
            selectinload(Order.created_by_user),
            selectinload(Order.items).selectinload(OrderItem.measurement_profile),
            selectinload(Order.status_history).selectinload(OrderStatusHistory.changed_by_user),
            selectinload(Order.payments).selectinload(Payment.received_by_user),
            selectinload(Order.invoice),
        )
        .where(Order.business_id == business.id, Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    order.items.sort(key=lambda item: item.position)
    order.status_history.sort(key=lambda history: sortable_datetime(history.changed_at))
    return order


async def update_order(
    session: AsyncSession,
    business: Business,
    order_id: uuid.UUID,
    payload: OrderUpdate,
) -> Order:
    order = await get_order(session, business, order_id)
    if order.status in TERMINAL_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Delivered and cancelled orders cannot be edited.",
        )
    updates = payload.model_dump(exclude_unset=True)
    if "due_date" in updates and updates["due_date"] is not None:
        if updates["due_date"] < order.order_date:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Due date cannot be before order date.",
            )
        order.due_date = updates["due_date"]
    if "notes" in updates:
        order.notes = updates["notes"]
    if "items" in updates and updates["items"] is not None:
        items_by_id = {item.id: item for item in order.items}
        for item_update in payload.items or []:
            item = items_by_id.get(item_update.id)
            if item is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Order item does not belong to this order.",
                )
            item.unit_price = item_update.unit_price
    if "discount_amount" in updates and updates["discount_amount"] is not None:
        order.discount_amount = updates["discount_amount"]
    if order.discount_amount > calculate_order_subtotal(order):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Discount amount cannot exceed the order subtotal.",
        )
    if order.invoice is not None:
        order.invoice.status = calculate_invoice_status(order)
    await session.commit()
    return await get_order(session, business, order_id)


async def update_order_status(
    session: AsyncSession,
    business: Business,
    current_user: User,
    order_id: uuid.UUID,
    payload: OrderStatusUpdate,
) -> Order:
    order = await get_order(session, business, order_id)
    allowed = ORDER_TRANSITIONS[order.status]
    if payload.status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Cannot transition order from {order.status} to {payload.status}.",
        )
    previous_status = order.status
    order.status = payload.status
    now = datetime.now(UTC)
    if payload.status == OrderStatus.DELIVERED:
        order.delivered_at = now
    if payload.status == OrderStatus.CANCELLED:
        order.cancelled_at = now
    for item in order.items:
        item.status = payload.status
    order.status_history.append(
        OrderStatusHistory(
            previous_status=previous_status,
            new_status=payload.status,
            changed_by=current_user.id,
            notes=payload.notes,
            changed_at=now,
        )
    )
    await session.commit()
    return await get_order(session, business, order_id)


def order_list_item(order: Order, today: date) -> OrderListItem:
    is_overdue, overdue_days = calculate_overdue(order, today)
    return OrderListItem(
        id=order.id,
        order_number=order.order_number,
        customer_id=order.customer_id,
        customer_name=customer_name(order.customer),
        customer_phone=order.customer.phone,
        status=order.status,
        order_date=order.order_date,
        due_date=order.due_date,
        item_count=len(order.items),
        garment_summary=garment_summary(order.items),
        is_overdue=is_overdue,
        overdue_days=overdue_days,
        created_at=order.created_at,
        total=calculate_order_total(order),
        outstanding_balance=calculate_outstanding_balance(order),
    )


def order_response(order: Order, business: Business) -> OrderDetailResponse:
    is_overdue, overdue_days = calculate_overdue(order, business_today(business))
    subtotal = calculate_order_subtotal(order)
    total = calculate_order_total(order)
    amount_paid = calculate_successful_payments(order)
    outstanding = calculate_outstanding_balance(order)
    financial_status = (
        FinancialStatus.PAID
        if outstanding == 0
        else FinancialStatus.PARTIALLY_PAID
        if amount_paid > 0
        else FinancialStatus.UNPAID
    )
    return OrderDetailResponse(
        id=order.id,
        order_number=order.order_number,
        customer=OrderCustomerSummary(
            id=order.customer.id,
            first_name=order.customer.first_name,
            last_name=order.customer.last_name,
            phone=order.customer.phone,
        ),
        status=order.status,
        order_date=order.order_date,
        due_date=order.due_date,
        notes=order.notes,
        created_by=order.created_by,
        created_by_name=user_name(order.created_by_user),
        delivered_at=order.delivered_at,
        cancelled_at=order.cancelled_at,
        created_at=order.created_at,
        updated_at=order.updated_at,
        items=[
            OrderItemResponse(
                id=item.id,
                garment_type=item.garment_type,
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=item.unit_price * item.quantity,
                measurement_profile_id=item.measurement_profile_id,
                measurement_profile_name=(
                    item.measurement_profile.name if item.measurement_profile else None
                ),
                style_reference_url=item.style_reference_url,
                notes=item.notes,
                status=item.status,
                position=item.position,
            )
            for item in order.items
        ],
        status_history=[
            OrderStatusHistoryResponse(
                id=history.id,
                previous_status=history.previous_status,
                new_status=history.new_status,
                changed_by=history.changed_by,
                changed_by_name=user_name(history.changed_by_user),
                notes=history.notes,
                changed_at=history.changed_at,
            )
            for history in order.status_history
        ],
        discount_amount=order.discount_amount,
        subtotal=subtotal,
        total=total,
        amount_paid=amount_paid,
        outstanding_balance=outstanding,
        financial_status=financial_status,
        is_overdue=is_overdue,
        overdue_days=overdue_days,
    )
