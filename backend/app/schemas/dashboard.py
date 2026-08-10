from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel

from app.models.finance import PaymentMethod
from app.models.order import OrderStatus


class DashboardSummary(BaseModel):
    total_customers: int
    active_orders: int
    due_today: int
    overdue_orders: int
    ready_for_pickup: int
    collected_this_month: Decimal
    outstanding_balance: Decimal


class DashboardOrderItem(BaseModel):
    id: UUID
    order_number: str
    customer_id: UUID
    customer_name: str
    customer_phone: str
    status: OrderStatus
    due_date: date
    created_at: datetime
    garment_summary: str
    is_overdue: bool
    days_overdue: int
    total: Decimal
    outstanding_balance: Decimal


class DashboardPaymentItem(BaseModel):
    id: UUID
    order_id: UUID
    order_number: str
    customer_id: UUID
    customer_name: str
    amount: Decimal
    payment_method: PaymentMethod
    paid_at: datetime
    received_by_name: str


class DashboardAlertType(StrEnum):
    OVERDUE_ORDER = "OVERDUE_ORDER"
    DUE_TODAY = "DUE_TODAY"
    READY_FOR_PICKUP = "READY_FOR_PICKUP"
    OUTSTANDING_BALANCE = "OUTSTANDING_BALANCE"
    UNPAID_DELIVERED = "UNPAID_DELIVERED"


class DashboardAlertSeverity(StrEnum):
    INFO = "INFO"
    WARNING = "WARNING"
    HIGH = "HIGH"


class DashboardAlert(BaseModel):
    id: str
    type: DashboardAlertType
    severity: DashboardAlertSeverity
    title: str
    message: str
    order_id: UUID
    customer_id: UUID
    created_from: date
