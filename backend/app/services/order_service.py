import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.timezone import business_today
from app.models.business import Business
from app.models.admin_audit import BusinessAuditLog
from app.models.customer import Customer
from app.models.finance import Payment, PaymentAllocation, PaymentInstallment, PaymentInstallmentPlan, PaymentStatus
from app.models.fulfillment import FulfillmentStatus, OrderFulfillment, OrderFulfillmentEvent
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
    PaymentInstallmentResponse,
    PaymentPlanResponse,
    OrderUpdate,
    total_pages,
)
from app.schemas.fulfillment import FulfillmentEventResponse, FulfillmentResponse
from app.schemas.fulfillment import FulfillmentUpdate
from app.services.customer_service import get_customer, normalize_phone
from app.services.financial_service import (
    allocate_payment_to_plan,
    calculate_invoice_status,
    calculate_order_subtotal,
    calculate_order_total,
    calculate_outstanding_balance,
    calculate_successful_payments,
)


def add_business_audit(session: AsyncSession, business: Business, actor: User, action: str, summary: str, request=None, details: dict | None = None) -> None:
    configuration = business.audit_configuration or {}
    if not configuration.get("enabled", True):
        return
    session.add(BusinessAuditLog(
        business_id=business.id,
        actor_id=actor.id,
        action=action,
        summary=summary,
        details=details or {} if configuration.get("capture_details", False) else {},
        source_ip=request.client.host if request and request.client and configuration.get("capture_ip", False) else None,
        user_agent=(request.headers.get("user-agent", "")[:500] or None) if request and configuration.get("capture_device", False) else None,
    ))

ORDER_TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.DRAFT: {
        OrderStatus.CONFIRMED,
        OrderStatus.CUTTING,
        OrderStatus.CANCELLED,
    },
    OrderStatus.CONFIRMED: {
        OrderStatus.CUTTING,
        OrderStatus.SEWING,
        OrderStatus.CANCELLED,
    },
    OrderStatus.CUTTING: {
        OrderStatus.SEWING,
        OrderStatus.FITTING,
        OrderStatus.FINISHING,
        OrderStatus.CANCELLED,
    },
    OrderStatus.SEWING: {
        OrderStatus.FITTING,
        OrderStatus.FINISHING,
        OrderStatus.READY,
        OrderStatus.CANCELLED,
    },
    OrderStatus.FITTING: {
        OrderStatus.SEWING,
        OrderStatus.FINISHING,
        OrderStatus.READY,
        OrderStatus.CANCELLED,
    },
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


def installment_status(amount: Decimal, paid: Decimal, due_date: date, business: Business) -> str:
    outstanding = max(amount - paid, Decimal("0.00"))
    if outstanding == 0:
        return "PAID"
    if due_date < business_today(business):
        return "OVERDUE"
    if paid > 0:
        return "PARTIALLY_PAID"
    return "UNPAID"


def allocation_total(allocations: list[PaymentAllocation]) -> Decimal:
    return sum((allocation.amount for allocation in allocations), Decimal("0.00"))


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
    request=None,
) -> Order:
    customer = await get_customer(session, business, payload.customer_id)
    if customer.archived_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Archived customers cannot receive new orders.",
        )
    if payload.delivery_charge > 0 and not business.delivery_charges_enabled:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Delivery charges are disabled for this business.",
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
        reference_image=payload.reference_image,
        discount_amount=payload.discount_amount,
        delivery_charge=payload.delivery_charge,
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
    if payload.payment_plan is not None and "installment_plans" not in (business.enabled_features or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Installment plans are not enabled for this business.",
        )
    order_total = sum((item.unit_price * item.quantity for item in payload.items), Decimal("0.00")) - payload.discount_amount + payload.delivery_charge
    if payload.initial_payment_amount is not None and payload.initial_payment_amount > order_total:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Initial payment cannot exceed the order total.")
    if payload.payment_plan is not None:
        order.payment_plan = PaymentInstallmentPlan(
            business_id=business.id,
            advance_amount=payload.payment_plan.advance_amount,
            advance_due_date=(payload.order_date if payload.payment_plan.advance_amount else None),
            installments=[
                PaymentInstallment(
                    amount=entry.amount,
                    due_date=entry.due_date,
                    position=index,
                    label=entry.label.strip(),
                )
                for index, entry in enumerate(payload.payment_plan.installments, start=1)
            ],
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
    add_business_audit(session, business, current_user, "ORDER_CREATED", f"Created order {order.order_number}", request, {"order_id": str(order.id)})
    session.add(order)
    try:
        if payload.fulfillment is not None:
            if payload.fulfillment.delivery_charge not in (None, order.delivery_charge):
                raise HTTPException(status_code=422, detail="Fulfillment delivery charge must match the order charge.")
            from app.services.fulfillment_service import update_fulfillment
            await update_fulfillment(session, business, current_user, order.id, payload.fulfillment)
        if payload.initial_payment_amount is not None:
            initial_payment = Payment(
                business_id=business.id,
                customer_id=customer.id,
                amount=payload.initial_payment_amount,
                payment_method=payload.initial_payment_method,
                status=PaymentStatus.SUCCESSFUL,
                received_by=current_user.id,
                paid_at=datetime.now(UTC),
                notes="Initial payment recorded when order was created.",
            )
            order.payments.append(initial_payment)
            if order.payment_plan is not None and "installment_plans" in (business.enabled_features or []):
                await session.flush()
                allocate_payment_to_plan(session, initial_payment, order.payment_plan)
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
            selectinload(Order.payment_plan).selectinload(PaymentInstallmentPlan.installments)
            .selectinload(PaymentInstallment.allocations),
            selectinload(Order.payment_plan).selectinload(PaymentInstallmentPlan.allocations),
            selectinload(Order.fulfillment)
            .selectinload(OrderFulfillment.events)
            .selectinload(OrderFulfillmentEvent.actor),
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
    current_user: User | None = None,
    request=None,
) -> Order:
    order = await get_order(session, business, order_id)
    if order.status in TERMINAL_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Delivered and cancelled orders cannot be edited.",
        )
    updates = payload.model_dump(exclude_unset=True)
    if "customer_id" in updates and updates["customer_id"] is not None and updates["customer_id"] != order.customer_id:
        customer = await get_customer(session, business, updates["customer_id"])
        if customer.archived_at is not None:
            raise HTTPException(status_code=409, detail="Archived customers cannot receive orders.")
        if order.payments:
            raise HTTPException(status_code=409, detail="Customer cannot be changed after payments are recorded.")
        order.customer_id = customer.id
    if "order_date" in updates and updates["order_date"] is not None:
        order.order_date = updates["order_date"]
    if order.due_date < order.order_date:
        raise HTTPException(status_code=422, detail="Due date cannot be before the order date.")
    if order.payment_plan is not None and (
        ("items" in updates and updates["items"] is not None)
        or ("discount_amount" in updates and updates["discount_amount"] is not None)
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Revise or remove the installment plan before changing order pricing.",
        )
    if "due_date" in updates and updates["due_date"] is not None:
        if updates["due_date"] < order.order_date:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Due date cannot be before order date.",
            )
        order.due_date = updates["due_date"]
    if "notes" in updates:
        order.notes = updates["notes"]
    if "reference_image" in updates:
        order.reference_image = updates["reference_image"]
    if "items" in updates and updates["items"] is not None:
        items_by_id = {item.id: item for item in order.items}
        submitted_ids = {entry.id for entry in payload.items or []}
        if submitted_ids != set(items_by_id):
            raise HTTPException(status_code=422, detail="All existing order items must be included; items cannot be added or removed during edit.")
        for item_update in payload.items or []:
            item = items_by_id.get(item_update.id)
            if item is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Order item does not belong to this order.",
                )
            item.garment_type = item_update.garment_type or item.garment_type
            item.description = item_update.description
            item.quantity = item_update.quantity or item.quantity
            item.unit_price = item_update.unit_price
            item.style_reference_url = item_update.style_reference_url
            item.notes = item_update.notes
            item.position = item_update.position or item.position
            if item_update.measurement_profile_id is not None:
                await validate_measurement_profile(
                    session, business, order.customer_id, item_update.measurement_profile_id
                )
            item.measurement_profile_id = item_update.measurement_profile_id
    if "delivery_charge" in updates and updates["delivery_charge"] is not None:
        if updates["delivery_charge"] > 0 and not business.delivery_charges_enabled:
            raise HTTPException(status_code=422, detail="Delivery charges are disabled for this business.")
        if order.payment_plan is not None or order.payments:
            raise HTTPException(status_code=409, detail="Delivery charge cannot change after a payment plan or payment exists.")
        order.delivery_charge = updates["delivery_charge"]
    if "discount_amount" in updates and updates["discount_amount"] is not None:
        order.discount_amount = updates["discount_amount"]
    if order.discount_amount > calculate_order_subtotal(order):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Discount amount cannot exceed the order subtotal.",
        )
    if calculate_successful_payments(order) > calculate_order_total(order):
        raise HTTPException(status_code=409, detail="Edited order total cannot be less than the payments already recorded.")
    if updates.get("fulfillment") is not None:
        fulfillment_payload = updates["fulfillment"]
        from app.services.fulfillment_service import update_fulfillment
        actor = current_user or order.created_by_user
        if actor is None:
            raise HTTPException(status_code=409, detail="Order editor could not be identified.")
        await update_fulfillment(session, business, actor, order.id, fulfillment_payload)
    if order.invoice is not None:
        order.invoice.status = calculate_invoice_status(order)
    if current_user:
        add_business_audit(session, business, current_user, "ORDER_UPDATED", f"Updated order {order.order_number}", request, {"order_id": str(order.id), "fields": sorted(updates)})
    await session.commit()
    return await get_order(session, business, order_id)


async def update_order_status(
    session: AsyncSession,
    business: Business,
    current_user: User,
    order_id: uuid.UUID,
    payload: OrderStatusUpdate,
    request=None,
) -> Order:
    order = await get_order(session, business, order_id)
    configured = business.order_status_configuration or {}
    configured_transitions = configured.get("transitions", {})
    allowed_values = configured_transitions.get(order.status.value, ORDER_TRANSITIONS[order.status])
    allowed_values = list(allowed_values)
    if OrderStatus.CANCELLED in ORDER_TRANSITIONS[order.status] and OrderStatus.CANCELLED.value not in allowed_values:
        allowed_values.append(OrderStatus.CANCELLED.value)
    allowed = {OrderStatus(value) for value in allowed_values}
    if payload.status in {OrderStatus.DELIVERED, OrderStatus.CANCELLED} and payload.status not in ORDER_TRANSITIONS[order.status]:
        raise HTTPException(status_code=422, detail="This terminal status is not allowed from the current status.")
    if payload.status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Cannot transition order from {order.status} to {payload.status}.",
        )
    if payload.status == OrderStatus.DELIVERED and (
        order.fulfillment is None or order.fulfillment.status != FulfillmentStatus.COMPLETED
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Record pickup or delivery handoff before marking this order delivered.",
        )
    if payload.status == OrderStatus.CANCELLED and (
        order.fulfillment is not None
        and order.fulfillment.status == FulfillmentStatus.OUT_FOR_DELIVERY
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An order cannot be cancelled while it is out for delivery.",
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
    add_business_audit(session, business, current_user, "ORDER_STATUS_UPDATED", f"Changed {order.order_number} to {payload.status.value}", request, {"order_id": str(order.id), "from": previous_status.value, "to": payload.status.value})
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
    payment_plan_response = None
    if order.payment_plan is not None:
        plan = order.payment_plan
        advance_paid = allocation_total(
            [allocation for allocation in plan.allocations if allocation.is_advance]
        )
        advance_amount = plan.advance_amount or Decimal("0.00")
        payment_plan_response = PaymentPlanResponse(
            advance_amount=plan.advance_amount,
            advance_due_date=plan.advance_due_date,
            advance_paid_amount=advance_paid,
            advance_outstanding_amount=max(advance_amount - advance_paid, Decimal("0.00")),
            advance_status=(
                installment_status(advance_amount, advance_paid, plan.advance_due_date, business)
                if plan.advance_amount is not None and plan.advance_due_date is not None
                else None
            ),
            installments=[
                PaymentInstallmentResponse(
                    id=entry.id,
                    amount=entry.amount,
                    due_date=entry.due_date,
                    position=entry.position,
                    label=entry.label,
                    paid_amount=allocation_total(entry.allocations),
                    outstanding_amount=max(entry.amount - allocation_total(entry.allocations), Decimal("0.00")),
                    status=installment_status(
                        entry.amount, allocation_total(entry.allocations), entry.due_date, business
                    ),
                )
                for entry in plan.installments
            ],
        )
    fulfillment_response = None
    if order.fulfillment is not None:
        fulfillment = order.fulfillment
        fulfillment_response = FulfillmentResponse(
            id=fulfillment.id,
            method=fulfillment.method,
            status=fulfillment.status,
            recipient_name=fulfillment.recipient_name,
            recipient_phone=fulfillment.recipient_phone,
            delivery_address=fulfillment.delivery_address,
            delivery_instructions=fulfillment.delivery_instructions,
            tracking_reference=fulfillment.tracking_reference,
            proof_of_delivery_url=fulfillment.proof_of_delivery_url,
            dispatched_at=fulfillment.dispatched_at,
            completed_at=fulfillment.completed_at,
            events=[
                FulfillmentEventResponse(
                    id=event.id,
                    event_type=event.event_type,
                    actor_id=event.actor_id,
                    actor_name=user_name(event.actor),
                    notes=event.notes,
                    occurred_at=event.occurred_at,
                )
                for event in fulfillment.events
            ],
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
        reference_image=order.reference_image,
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
        delivery_charge=order.delivery_charge,
        subtotal=subtotal,
        total=total,
        amount_paid=amount_paid,
        outstanding_balance=outstanding,
        financial_status=financial_status,
        is_overdue=is_overdue,
        overdue_days=overdue_days,
        payment_plan=payment_plan_response,
        fulfillment=fulfillment_response,
    )
