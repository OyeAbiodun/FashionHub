import math
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.finance import InvoiceStatus, PaymentMethod, PaymentStatus
from app.schemas.customer import blank_to_none


class PaymentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    payment_method: PaymentMethod
    reference: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=5000)
    paid_at: datetime | None = None
    installment_id: UUID | None = None
    apply_automatically: bool = True

    @field_validator("reference", "notes", mode="before")
    @classmethod
    def normalize_optional_string(cls, value: str | None) -> str | None:
        return blank_to_none(value)


class PaymentResponse(BaseModel):
    id: UUID
    order_id: UUID
    customer_id: UUID
    amount: Decimal
    payment_method: PaymentMethod
    status: PaymentStatus
    reference: str | None
    notes: str | None
    received_by: UUID
    received_by_name: str
    paid_at: datetime
    created_at: datetime
    allocations: list["PaymentAllocationResponse"] = Field(default_factory=list)


class PaymentAllocationResponse(BaseModel):
    amount: Decimal
    is_advance: bool
    installment_id: UUID | None
    label: str


class PaymentListItem(PaymentResponse):
    order_number: str
    customer_name: str


class PaymentListResponse(BaseModel):
    items: list[PaymentListItem]
    page: int
    page_size: int
    total: int
    total_pages: int


class PaymentSummaryResponse(BaseModel):
    successful_count: int
    successful_amount: Decimal
    today_count: int
    today_amount: Decimal
    month_count: int
    month_amount: Decimal
    pending_count: int
    today_start: datetime
    tomorrow_start: datetime
    month_start: datetime
    next_month_start: datetime


class InvoiceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    due_date: date | None = None
    notes: str | None = Field(default=None, max_length=5000)

    @field_validator("notes", mode="before")
    @classmethod
    def normalize_optional_notes(cls, value: str | None) -> str | None:
        return blank_to_none(value)


class InvoiceBusinessResponse(BaseModel):
    name: str
    phone: str
    email: str | None
    address: str | None
    logo_url: str | None
    currency: str
    timezone: str
    invoice_notes: str | None
    invoice_footer: str | None


class InvoiceCustomerResponse(BaseModel):
    id: UUID
    name: str
    phone: str
    email: str | None
    address: str | None


class InvoiceOrderResponse(BaseModel):
    id: UUID
    order_number: str
    order_date: date
    due_date: date


class InvoiceItemResponse(BaseModel):
    garment_type: str
    description: str | None
    quantity: int
    unit_price: Decimal
    line_total: Decimal


class InvoiceFinancialSummary(BaseModel):
    subtotal: Decimal
    discount_amount: Decimal
    delivery_charge: Decimal = Decimal("0.00")
    total: Decimal
    amount_paid: Decimal
    outstanding_balance: Decimal


class InvoiceResponse(BaseModel):
    id: UUID
    invoice_number: str
    status: InvoiceStatus
    issued_at: datetime
    due_date: date | None
    notes: str | None
    created_at: datetime
    business: InvoiceBusinessResponse
    customer: InvoiceCustomerResponse
    order: InvoiceOrderResponse
    items: list[InvoiceItemResponse]
    financial_summary: InvoiceFinancialSummary
    payments: list[PaymentResponse]


def total_pages(total: int, page_size: int) -> int:
    return math.ceil(total / page_size) if total else 0


PaymentResponse.model_rebuild()
