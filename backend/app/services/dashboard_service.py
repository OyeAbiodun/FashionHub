import uuid
from datetime import timedelta

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.timezone import business_today, current_month_utc_bounds
from app.models.business import Business
from app.models.customer import Customer
from app.models.finance import Payment, PaymentStatus
from app.models.order import Order, OrderItem, OrderStatus
from app.schemas.dashboard import (
    DashboardAlert,
    DashboardAlertSeverity,
    DashboardAlertType,
    DashboardCalendarEvent,
    DashboardCalendarEventType,
    DashboardOrderItem,
    DashboardPaymentItem,
    DashboardSummary,
)
from app.services.financial_service import (
    ZERO,
    calculate_order_total,
    calculate_outstanding_balance,
    customer_name,
    user_name,
)
from app.services.order_service import garment_summary

ACTIVE_STATUSES = tuple(
    status for status in OrderStatus if status not in {OrderStatus.DELIVERED, OrderStatus.CANCELLED}
)


def _order_financials(business_id: uuid.UUID):
    item_totals = (
        select(
            OrderItem.order_id.label("order_id"),
            func.sum(OrderItem.quantity * OrderItem.unit_price).label("subtotal"),
        )
        .group_by(OrderItem.order_id)
        .subquery()
    )
    payment_totals = (
        select(Payment.order_id.label("order_id"), func.sum(Payment.amount).label("paid"))
        .where(Payment.status == PaymentStatus.SUCCESSFUL)
        .group_by(Payment.order_id)
        .subquery()
    )
    subtotal = func.coalesce(item_totals.c.subtotal, ZERO)
    paid = func.coalesce(payment_totals.c.paid, ZERO)
    raw_total = subtotal - Order.discount_amount + Order.delivery_charge
    order_total = case((raw_total > 0, raw_total), else_=ZERO)
    raw_outstanding = order_total - paid
    outstanding = case((raw_outstanding > 0, raw_outstanding), else_=ZERO)
    return (
        select(
            Order.id.label("order_id"),
            Order.status.label("status"),
            order_total.label("total"),
            outstanding.label("outstanding"),
        )
        .outerjoin(item_totals, item_totals.c.order_id == Order.id)
        .outerjoin(payment_totals, payment_totals.c.order_id == Order.id)
        .where(Order.business_id == business_id)
        .subquery()
    )


async def get_dashboard_summary(session: AsyncSession, business: Business) -> DashboardSummary:
    today = business_today(business)
    month_start, next_month = current_month_utc_bounds(business)
    financials = _order_financials(business.id)
    statement = select(
        select(func.count())
        .select_from(Customer)
        .where(Customer.business_id == business.id, Customer.archived_at.is_(None))
        .scalar_subquery(),
        select(func.count())
        .select_from(Order)
        .where(Order.business_id == business.id, Order.status.in_(ACTIVE_STATUSES))
        .scalar_subquery(),
        select(func.count())
        .select_from(Order)
        .where(
            Order.business_id == business.id,
            Order.status.in_(ACTIVE_STATUSES),
            Order.due_date == today,
        )
        .scalar_subquery(),
        select(func.count())
        .select_from(Order)
        .where(
            Order.business_id == business.id,
            Order.status.in_(ACTIVE_STATUSES),
            Order.due_date < today,
        )
        .scalar_subquery(),
        select(func.count())
        .select_from(Order)
        .where(Order.business_id == business.id, Order.status == OrderStatus.READY)
        .scalar_subquery(),
        select(func.coalesce(func.sum(Payment.amount), ZERO))
        .where(
            Payment.business_id == business.id,
            Payment.status == PaymentStatus.SUCCESSFUL,
            Payment.paid_at >= month_start,
            Payment.paid_at < next_month,
        )
        .scalar_subquery(),
        select(func.coalesce(func.sum(financials.c.outstanding), ZERO))
        .where(financials.c.status != OrderStatus.CANCELLED)
        .scalar_subquery(),
    )
    values = (await session.execute(statement)).one()
    return DashboardSummary(
        total_customers=values[0],
        active_orders=values[1],
        due_today=values[2],
        overdue_orders=values[3],
        ready_for_pickup=values[4],
        collected_this_month=values[5],
        outstanding_balance=values[6],
    )


def _dashboard_order(order: Order, today) -> DashboardOrderItem:
    days_overdue = max((today - order.due_date).days, 0)
    return DashboardOrderItem(
        id=order.id,
        order_number=order.order_number,
        customer_id=order.customer_id,
        customer_name=customer_name(order.customer),
        customer_phone=order.customer.phone,
        status=order.status,
        due_date=order.due_date,
        created_at=order.created_at,
        garment_summary=garment_summary(order.items),
        is_overdue=days_overdue > 0 and order.status in ACTIVE_STATUSES,
        days_overdue=days_overdue if order.status in ACTIVE_STATUSES else 0,
        total=calculate_order_total(order),
        outstanding_balance=calculate_outstanding_balance(order),
    )


async def _load_orders(session: AsyncSession, statement) -> list[Order]:
    result = await session.execute(
        statement.options(
            joinedload(Order.customer),
            selectinload(Order.items),
            selectinload(Order.payments),
        )
    )
    return list(result.scalars().unique().all())


async def get_due_orders(
    session: AsyncSession, business: Business, days: int, limit: int
) -> list[DashboardOrderItem]:
    today = business_today(business)
    orders = await _load_orders(
        session,
        select(Order)
        .where(
            Order.business_id == business.id,
            Order.status.in_(ACTIVE_STATUSES),
            Order.due_date <= today + timedelta(days=days),
        )
        .order_by(Order.due_date.asc(), Order.created_at.asc())
        .limit(limit),
    )
    return [_dashboard_order(order, today) for order in orders]


async def get_recent_orders(
    session: AsyncSession, business: Business, limit: int
) -> list[DashboardOrderItem]:
    orders = await _load_orders(
        session,
        select(Order)
        .where(Order.business_id == business.id)
        .order_by(Order.created_at.desc())
        .limit(limit),
    )
    today = business_today(business)
    return [_dashboard_order(order, today) for order in orders]


async def get_recent_payments(
    session: AsyncSession, business: Business, limit: int
) -> list[DashboardPaymentItem]:
    result = await session.execute(
        select(Payment)
        .options(
            joinedload(Payment.order),
            joinedload(Payment.customer),
            joinedload(Payment.received_by_user),
        )
        .where(
            Payment.business_id == business.id,
            Payment.status == PaymentStatus.SUCCESSFUL,
        )
        .order_by(Payment.paid_at.desc(), Payment.created_at.desc())
        .limit(limit)
    )
    return [
        DashboardPaymentItem(
            id=payment.id,
            order_id=payment.order_id,
            order_number=payment.order.order_number,
            customer_id=payment.customer_id,
            customer_name=customer_name(payment.customer),
            amount=payment.amount,
            payment_method=payment.payment_method,
            paid_at=payment.paid_at,
            received_by_name=user_name(payment.received_by_user),
        )
        for payment in result.scalars().all()
    ]


ALERT_PRIORITY = {
    DashboardAlertType.OVERDUE_ORDER: 0,
    DashboardAlertType.UNPAID_DELIVERED: 1,
    DashboardAlertType.OUTSTANDING_BALANCE: 2,
    DashboardAlertType.DUE_TODAY: 3,
    DashboardAlertType.READY_FOR_PICKUP: 4,
}


def _alert(
    alert_type: DashboardAlertType,
    severity: DashboardAlertSeverity,
    order: Order,
    title: str,
    message: str,
) -> DashboardAlert:
    return DashboardAlert(
        id=f"{alert_type.value}:{order.id}",
        type=alert_type,
        severity=severity,
        title=title,
        message=message,
        order_id=order.id,
        customer_id=order.customer_id,
        created_from=order.due_date,
    )


async def get_operational_alerts(
    session: AsyncSession, business: Business, limit: int
) -> list[DashboardAlert]:
    today = business_today(business)
    candidates = await _load_orders(
        session,
        select(Order)
        .where(
            Order.business_id == business.id,
            or_(
                Order.due_date <= today,
                Order.status == OrderStatus.READY,
                Order.status == OrderStatus.DELIVERED,
            ),
            Order.status != OrderStatus.CANCELLED,
        )
        .order_by(Order.due_date.asc())
        .limit(200),
    )
    alerts: list[DashboardAlert] = []
    for order in candidates:
        name = customer_name(order.customer)
        outstanding = calculate_outstanding_balance(order)
        if order.status in ACTIVE_STATUSES and order.due_date < today:
            days = (today - order.due_date).days
            alerts.append(
                _alert(
                    DashboardAlertType.OVERDUE_ORDER,
                    DashboardAlertSeverity.HIGH,
                    order,
                    f"Order {order.order_number} is overdue",
                    f"{name}'s order was due {days} day{'s' if days != 1 else ''} ago.",
                )
            )
        elif order.status in ACTIVE_STATUSES and order.due_date == today:
            alerts.append(
                _alert(
                    DashboardAlertType.DUE_TODAY,
                    DashboardAlertSeverity.WARNING,
                    order,
                    f"Order {order.order_number} is due today",
                    f"{name}'s order needs attention today.",
                )
            )
        if order.status == OrderStatus.DELIVERED and outstanding > ZERO:
            alerts.append(
                _alert(
                    DashboardAlertType.UNPAID_DELIVERED,
                    DashboardAlertSeverity.HIGH,
                    order,
                    f"Delivered order {order.order_number} is unpaid",
                    f"{name} still has an outstanding balance.",
                )
            )
        if order.status == OrderStatus.READY:
            alerts.append(
                _alert(
                    DashboardAlertType.READY_FOR_PICKUP,
                    DashboardAlertSeverity.INFO,
                    order,
                    f"Order {order.order_number} is ready for pickup",
                    f"{name}'s garments are ready.",
                )
            )
            if outstanding > ZERO:
                alerts.append(
                    _alert(
                        DashboardAlertType.OUTSTANDING_BALANCE,
                        DashboardAlertSeverity.WARNING,
                        order,
                        f"Balance due on {order.order_number}",
                        f"Collect the remaining balance when {name} picks up the order.",
                    )
                )
    alerts.sort(key=lambda alert: (ALERT_PRIORITY[alert.type], alert.created_from))
    return alerts[:limit]


async def get_calendar_events(
    session: AsyncSession, business: Business, year: int, month: int
) -> list[DashboardCalendarEvent]:
    from app.models.task import Task

    # Fetch orders due in the specified month/year range
    orders_stmt = (
        select(Order)
        .options(joinedload(Order.customer), selectinload(Order.items))
        .where(
            Order.business_id == business.id,
            Order.status != OrderStatus.CANCELLED,
            func.extract("year", Order.due_date) == year,
            func.extract("month", Order.due_date) == month,
        )
    )
    orders = (await session.execute(orders_stmt)).scalars().unique().all()

    # Fetch tasks due in the specified month/year range
    tasks_stmt = (
        select(Task)
        .where(
            Task.business_id == business.id,
            Task.due_at.is_not(None),
            func.extract("year", Task.due_at) == year,
            func.extract("month", Task.due_at) == month,
        )
    )
    tasks = (await session.execute(tasks_stmt)).scalars().all()

    events: list[DashboardCalendarEvent] = []

    for order in orders:
        c_name = customer_name(order.customer) if order.customer else "Guest Customer"
        g_summary = garment_summary(order.items)
        ev_type = (
            DashboardCalendarEventType.ORDER_FITTING
            if order.status == OrderStatus.FITTING
            else DashboardCalendarEventType.ORDER_DUE
        )
        events.append(
            DashboardCalendarEvent(
                id=f"order:{order.id}",
                event_type=ev_type,
                title=f"#{order.order_number} - {c_name} ({g_summary})",
                event_date=order.due_date,
                status=order.status.value,
                customer_name=c_name,
                order_id=order.id,
            )
        )

    for task in tasks:
        if task.due_at:
            events.append(
                DashboardCalendarEvent(
                    id=f"task:{task.id}",
                    event_type=DashboardCalendarEventType.TASK_DUE,
                    title=f"Task: {task.title}",
                    event_date=task.due_at.date(),
                    status=task.status.value,
                    task_id=task.id,
                    priority=task.priority.value,
                )
            )

    events.sort(key=lambda e: e.event_date)
    return events
