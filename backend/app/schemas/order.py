import math
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.finance import PaymentMethod
from app.models.order import OrderStatus
from app.schemas.customer import blank_to_none
from app.schemas.fulfillment import FulfillmentResponse, FulfillmentUpdate


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


class PaymentInstallmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    due_date: date
    label: str = Field(min_length=1, max_length=100)

    @field_validator("label", mode="before")
    @classmethod
    def trim_label(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class PaymentPlanCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    advance_amount: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    installments: list[PaymentInstallmentCreate] = Field(min_length=1)

    @model_validator(mode="after")
    def installment_dates_are_ordered(self) -> "PaymentPlanCreate":
        dates = [entry.due_date for entry in self.installments]
        if dates != sorted(dates):
            raise ValueError("Installment due dates must be in chronological order.")
        return self


class OrderCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    customer_id: UUID
    order_date: date
    due_date: date
    notes: str | None = Field(default=None, max_length=5000)
    reference_image: str = Field(min_length=1, max_length=1_500_000)
    status: OrderStatus = OrderStatus.CONFIRMED
    items: list[OrderItemCreate] = Field(min_length=1)
    discount_amount: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=12, decimal_places=2)
    delivery_charge: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=12, decimal_places=2)
    initial_payment_amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    initial_payment_method: PaymentMethod | None = None
    payment_plan: PaymentPlanCreate | None = None
    fulfillment: FulfillmentUpdate | None = None

    @field_validator("notes", mode="before")
    @classmethod
    def normalize_optional_notes(cls, value: str | None) -> str | None:
        return blank_to_none(value)

    @field_validator("reference_image")
    @classmethod
    def validate_reference_image(cls, value: str) -> str:
        if not value.startswith(("data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,")):
            raise ValueError("Order reference must be a JPEG, PNG, or WebP image.")
        return value

    @model_validator(mode="after")
    def due_date_must_not_precede_order_date(self) -> "OrderCreate":
        if self.due_date < self.order_date:
            raise ValueError("Due date cannot be before order date.")
        if self.status not in {OrderStatus.DRAFT, OrderStatus.CONFIRMED}:
            raise ValueError("New orders can only start as DRAFT or CONFIRMED.")
        subtotal = sum((item.unit_price * item.quantity for item in self.items), Decimal("0.00"))
        if self.discount_amount > subtotal:
            raise ValueError("Discount amount cannot exceed the order subtotal.")
        if (self.initial_payment_amount is None) != (self.initial_payment_method is None):
            raise ValueError("Initial payment amount and method must be provided together.")
        if self.initial_payment_amount is not None:
            total = subtotal - self.discount_amount + self.delivery_charge
            if self.initial_payment_amount > total:
                raise ValueError("Initial payment cannot exceed the order total.")
        if self.payment_plan is not None:
            if any(entry.due_date < self.order_date for entry in self.payment_plan.installments):
                raise ValueError("Installment due dates cannot be before the order date.")
            total = subtotal - self.discount_amount + self.delivery_charge
            scheduled = self.payment_plan.advance_amount or Decimal("0.00")
            scheduled += sum((item.amount for item in self.payment_plan.installments), Decimal("0.00"))
            if scheduled != total:
                raise ValueError("Advance and installment amounts must equal the order total.")
        if self.fulfillment is not None and self.fulfillment.delivery_charge is not None:
            if self.fulfillment.delivery_charge != self.delivery_charge:
                raise ValueError("Set delivery charge in the order pricing fields.")
        return self


class OrderItemPriceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: UUID
    garment_type: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=5000)
    quantity: int | None = Field(default=None, ge=1)
    unit_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    measurement_profile_id: UUID | None = None
    style_reference_url: str | None = Field(default=None, max_length=1000)
    notes: str | None = Field(default=None, max_length=5000)
    position: int | None = Field(default=None, ge=1)


class OrderUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    due_date: date | None = None
    order_date: date | None = None
    customer_id: UUID | None = None
    notes: str | None = Field(default=None, max_length=5000)
    reference_image: str | None = Field(default=None, max_length=1_500_000)
    discount_amount: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    items: list[OrderItemPriceUpdate] | None = None
    delivery_charge: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    fulfillment: FulfillmentUpdate | None = None

    @field_validator("notes", mode="before")
    @classmethod
    def normalize_optional_notes(cls, value: str | None) -> str | None:
        return blank_to_none(value)

    @field_validator("reference_image")
    @classmethod
    def validate_reference_image(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith(("data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,")):
            raise ValueError("Order reference must be a JPEG, PNG, or WebP image.")
        return value


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


class PaymentInstallmentResponse(BaseModel):
    id: UUID
    amount: Decimal
    due_date: date
    position: int
    label: str
    paid_amount: Decimal
    outstanding_amount: Decimal
    status: str


class PaymentPlanResponse(BaseModel):
    advance_amount: Decimal | None
    advance_due_date: date | None
    advance_paid_amount: Decimal
    advance_outstanding_amount: Decimal
    advance_status: str | None
    installments: list[PaymentInstallmentResponse]


class OrderDetailResponse(BaseModel):
    id: UUID
    order_number: str
    customer: OrderCustomerSummary
    status: OrderStatus
    order_date: date
    due_date: date
    notes: str | None
    reference_image: str | None = None
    created_by: UUID
    created_by_name: str
    delivered_at: datetime | None
    cancelled_at: datetime | None
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemResponse]
    status_history: list[OrderStatusHistoryResponse]
    discount_amount: Decimal
    delivery_charge: Decimal
    subtotal: Decimal
    total: Decimal
    amount_paid: Decimal
    outstanding_balance: Decimal
    financial_status: FinancialStatus
    is_overdue: bool
    overdue_days: int
    payment_plan: PaymentPlanResponse | None = None
    fulfillment: FulfillmentResponse | None = None


OrderCreate.model_rebuild()
OrderDetailResponse.model_rebuild()


def total_pages(total: int, page_size: int) -> int:
    return math.ceil(total / page_size) if total else 0
