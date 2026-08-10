import math
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.order import OrderStatus
from app.schemas.customer import blank_to_none


class OrderItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    garment_type: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=5000)
    quantity: int = Field(default=1, ge=1)
    unit_price: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=12, decimal_places=2)
    measurement_profile_id: UUID | None = None
    style_reference_url: str | None = Field(default=None, max_length=1000)
    notes: str | None = Field(default=None, max_length=5000)
    position: int | None = Field(default=None, ge=1)

    @field_validator("garment_type", mode="before")
    @classmethod
    def trim_required_string(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value

    @field_validator("description", "style_reference_url", "notes", mode="before")
    @classmethod
    def normalize_optional_string(cls, value: str | None) -> str | None:
        return blank_to_none(value)


class OrderCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    customer_id: UUID
    order_date: date
    due_date: date
    notes: str | None = Field(default=None, max_length=5000)
    status: OrderStatus = OrderStatus.CONFIRMED
    items: list[OrderItemCreate] = Field(min_length=1)
    discount_amount: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=12, decimal_places=2)

    @field_validator("notes", mode="before")
    @classmethod
    def normalize_optional_notes(cls, value: str | None) -> str | None:
        return blank_to_none(value)

    @model_validator(mode="after")
    def due_date_must_not_precede_order_date(self) -> "OrderCreate":
        if self.due_date < self.order_date:
            raise ValueError("Due date cannot be before order date.")
        if self.status not in {OrderStatus.DRAFT, OrderStatus.CONFIRMED}:
            raise ValueError("New orders can only start as DRAFT or CONFIRMED.")
        subtotal = sum((item.unit_price * item.quantity for item in self.items), Decimal("0.00"))
        if self.discount_amount > subtotal:
            raise ValueError("Discount amount cannot exceed the order subtotal.")
        return self


class OrderItemPriceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    unit_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)


class OrderUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    due_date: date | None = None
    notes: str | None = Field(default=None, max_length=5000)
    discount_amount: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    items: list[OrderItemPriceUpdate] | None = None

    @field_validator("notes", mode="before")
    @classmethod
    def normalize_optional_notes(cls, value: str | None) -> str | None:
        return blank_to_none(value)


class OrderStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: OrderStatus
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("notes", mode="before")
    @classmethod
    def normalize_optional_notes(cls, value: str | None) -> str | None:
        return blank_to_none(value)


class OrderCustomerSummary(BaseModel):
    id: UUID
    first_name: str
    last_name: str | None
    phone: str


class FinancialStatus(StrEnum):
    UNPAID = "UNPAID"
    PARTIALLY_PAID = "PARTIALLY_PAID"
    PAID = "PAID"


class OrderItemResponse(BaseModel):
    id: UUID
    garment_type: str
    description: str | None
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    measurement_profile_id: UUID | None
    measurement_profile_name: str | None
    style_reference_url: str | None
    notes: str | None
    status: OrderStatus | None
    position: int


class OrderStatusHistoryResponse(BaseModel):
    id: UUID
    previous_status: OrderStatus | None
    new_status: OrderStatus
    changed_by: UUID
    changed_by_name: str
    notes: str | None
    changed_at: datetime


class OrderListItem(BaseModel):
    id: UUID
    order_number: str
    customer_id: UUID
    customer_name: str
    customer_phone: str
    status: OrderStatus
    order_date: date
    due_date: date
    item_count: int
    garment_summary: str
    is_overdue: bool
    overdue_days: int
    created_at: datetime
    total: Decimal
    outstanding_balance: Decimal


class OrderListResponse(BaseModel):
    items: list[OrderListItem]
    page: int
    page_size: int
    total: int
    total_pages: int


class OrderDetailResponse(BaseModel):
    id: UUID
    order_number: str
    customer: OrderCustomerSummary
    status: OrderStatus
    order_date: date
    due_date: date
    notes: str | None
    created_by: UUID
    created_by_name: str
    delivered_at: datetime | None
    cancelled_at: datetime | None
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemResponse]
    status_history: list[OrderStatusHistoryResponse]
    discount_amount: Decimal
    subtotal: Decimal
    total: Decimal
    amount_paid: Decimal
    outstanding_balance: Decimal
    financial_status: FinancialStatus
    is_overdue: bool
    overdue_days: int


def total_pages(total: int, page_size: int) -> int:
    return math.ceil(total / page_size) if total else 0
