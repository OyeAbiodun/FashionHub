from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import business_timezone
from app.models.business import Business
from app.models.customer import Customer
from app.models.finance import Payment, PaymentStatus
from app.models.order import Order, OrderItem, OrderStatus
from app.schemas.reports import (
    BusinessReports,
    ReportStatusCount,
    ReportTopCustomer,
    ReportTotals,
    ReportTrendPoint,
)

CENT = Decimal("0.01")
ZERO = Decimal("0.00")


def _month_start(value: date) -> date:
    return value.replace(day=1)


def _next_month(value: date) -> date:
    if value.month == 12:
        return value.replace(year=value.year + 1, month=1, day=1)
    return value.replace(month=value.month + 1, day=1)


def _month_label(value: date) -> str:
    return value.strftime("%Y-%m")


def _utc_bounds(start: date, end_exclusive: date, timezone: ZoneInfo):
    start_local = datetime.combine(start, datetime.min.time(), tzinfo=timezone)
    end_local = datetime.combine(end_exclusive, datetime.min.time(), tzinfo=timezone)
    return start_local.astimezone(UTC), end_local.astimezone(UTC)


def _money(value) -> str:
    return str(Decimal(value or ZERO).quantize(CENT, rounding=ROUND_HALF_UP))


async def get_business_reports(
    session: AsyncSession,
    business: Business,
    start_date: date,
    end_date: date,
) -> BusinessReports:
    timezone = business_timezone(business)
    local_start_utc, local_end_utc = _utc_bounds(
        start_date, end_date + timedelta(days=1), timezone
    )

    item_totals = (
        select(
            OrderItem.order_id.label("order_id"),
            func.sum(OrderItem.quantity * OrderItem.unit_price).label("subtotal"),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.business_id == business.id)
        .group_by(OrderItem.order_id)
        .subquery()
    )
    raw_order_total = (
        func.coalesce(item_totals.c.subtotal, ZERO)
        - Order.discount_amount
        + Order.delivery_charge
    )
    order_total = case((raw_order_total > ZERO, raw_order_total), else_=ZERO)
    order_scope = (
        select(
            Order.id.label("order_id"),
            Order.customer_id.label("customer_id"),
            Order.status.label("status"),
            Order.order_date.label("order_date"),
            order_total.label("order_total"),
        )
        .outerjoin(item_totals, item_totals.c.order_id == Order.id)
        .where(
            Order.business_id == business.id,
            Order.order_date >= start_date,
            Order.order_date <= end_date,
        )
        .subquery()
    )

    month_starts = []
    current_month = _month_start(start_date)
    while current_month <= end_date:
        month_starts.append(current_month)
        current_month = _next_month(current_month)

    order_columns = []
    payment_columns = []
    for index, month_start in enumerate(month_starts):
        next_month = _next_month(month_start)
        date_start = max(month_start, start_date)
        date_end_exclusive = min(next_month, end_date + timedelta(days=1))
        start_utc, end_utc = _utc_bounds(date_start, date_end_exclusive, timezone)
        order_match = and_(
            order_scope.c.order_date >= date_start,
            order_scope.c.order_date < date_end_exclusive,
            order_scope.c.status != OrderStatus.CANCELLED,
        )
        payment_match = and_(
            Payment.paid_at >= start_utc,
            Payment.paid_at < end_utc,
            Payment.status == PaymentStatus.SUCCESSFUL,
            Payment.business_id == business.id,
        )
        order_columns.extend(
            [
                func.coalesce(
                    func.sum(case((order_match, 1), else_=0)), 0
                ).label(f"order_count_{index}"),
                func.coalesce(
                    func.sum(case((order_match, order_scope.c.order_total), else_=ZERO)), ZERO
                ).label(f"order_value_{index}"),
            ]
        )
        payment_columns.append(
            func.coalesce(
                func.sum(case((payment_match, Payment.amount), else_=ZERO)), ZERO
            ).label(f"collected_{index}")
        )

    order_aggregates = (
        await session.execute(
            select(*order_columns).select_from(order_scope)
        )
    ).one()
    payment_aggregates = (
        await session.execute(
            select(*payment_columns)
            .select_from(Payment)
            .where(
                Payment.business_id == business.id,
                Payment.status == PaymentStatus.SUCCESSFUL,
                Payment.paid_at >= local_start_utc,
                Payment.paid_at < local_end_utc,
            )
        )
    ).one()

    trend = []
    total_orders = 0
    total_order_value = ZERO
    total_collected = ZERO
    for index, month_start in enumerate(month_starts):
        month_order_count = int(order_aggregates[index * 2] or 0)
        month_order_value = Decimal(order_aggregates[index * 2 + 1] or ZERO)
        month_collected = Decimal(payment_aggregates[index] or ZERO)
        total_orders += month_order_count
        total_order_value += month_order_value
        total_collected += month_collected
        trend.append(
            ReportTrendPoint(
                period=_month_label(month_start),
                order_count=month_order_count,
                order_value=_money(month_order_value),
                collected_revenue=_money(month_collected),
            )
        )

    status_rows = (
        await session.execute(
            select(order_scope.c.status, func.count())
            .select_from(order_scope)
            .group_by(order_scope.c.status)
            .order_by(order_scope.c.status)
        )
    ).all()
    status_breakdown = [
        ReportStatusCount(status=status.value, count=count)
        for status, count in status_rows
    ]

    customer_count = int(
        await session.scalar(
            select(func.count(func.distinct(order_scope.c.customer_id))).where(
                order_scope.c.status != OrderStatus.CANCELLED
            )
        )
        or 0
    )

    period_paid_totals = (
        select(
            Payment.order_id.label("order_id"),
            func.sum(Payment.amount).label("paid"),
        )
        .join(Order, Order.id == Payment.order_id)
        .where(
            Payment.business_id == business.id,
            Payment.status == PaymentStatus.SUCCESSFUL,
            Order.business_id == business.id,
            Order.order_date >= start_date,
            Order.order_date <= end_date,
        )
        .group_by(Payment.order_id)
        .subquery()
    )
    outstanding_expression = (
        order_scope.c.order_total - func.coalesce(period_paid_totals.c.paid, ZERO)
    )
    outstanding = await session.scalar(
        select(
            func.coalesce(
                func.sum(
                    case(
                        (outstanding_expression > ZERO, outstanding_expression),
                        else_=ZERO,
                    )
                ),
                ZERO,
            )
        )
        .select_from(order_scope)
        .outerjoin(period_paid_totals, period_paid_totals.c.order_id == order_scope.c.order_id)
        .where(order_scope.c.status != OrderStatus.CANCELLED)
    )

    top_customer_rows = (
        await session.execute(
            select(
                Customer.id,
                func.trim(
                    func.coalesce(Customer.first_name, "")
                    + " "
                    + func.coalesce(Customer.last_name, "")
                ).label("name"),
                func.count(func.distinct(Payment.order_id)).label("order_count"),
                func.coalesce(func.sum(Payment.amount), ZERO).label("collected"),
            )
            .select_from(Payment)
            .join(Customer, Customer.id == Payment.customer_id)
            .where(
                Payment.business_id == business.id,
                Payment.status == PaymentStatus.SUCCESSFUL,
                Payment.paid_at >= local_start_utc,
                Payment.paid_at < local_end_utc,
                Customer.business_id == business.id,
                Customer.archived_at.is_(None),
            )
            .group_by(
                Customer.id,
                Customer.first_name,
                Customer.last_name,
            )
            .order_by(func.sum(Payment.amount).desc(), Customer.first_name)
            .limit(5)
        )
    ).all()
    top_customers = [
        ReportTopCustomer(
            customer_id=str(customer_id),
            customer_name=name,
            order_count=int(order_count or 0),
            collected_revenue=_money(collected),
        )
        for customer_id, name, order_count, collected in top_customer_rows
    ]

    return BusinessReports(
        start_date=start_date,
        end_date=end_date,
        currency=business.currency,
        totals=ReportTotals(
            order_count=total_orders,
            customer_count=customer_count,
            order_value=_money(total_order_value),
            collected_revenue=_money(total_collected),
            outstanding_balance=_money(outstanding),
            average_order_value=_money(
                total_order_value / total_orders if total_orders else ZERO
            ),
        ),
        trend=trend,
        status_breakdown=status_breakdown,
        top_customers=top_customers,
    )
