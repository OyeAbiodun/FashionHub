from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Date,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.customer import Customer
    from app.models.order import Order
    from app.models.user import User


class PaymentMethod(StrEnum):
    CASH = "CASH"
    TRANSFER = "TRANSFER"
    CARD = "CARD"
    POS = "POS"
    OTHER = "OTHER"


class PaymentStatus(StrEnum):
    PENDING = "PENDING"
    SUCCESSFUL = "SUCCESSFUL"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"


class InvoiceStatus(StrEnum):
    DRAFT = "DRAFT"
    ISSUED = "ISSUED"
    PARTIALLY_PAID = "PARTIALLY_PAID"
    PAID = "PAID"
    CANCELLED = "CANCELLED"


class InvoiceCounter(Base):
    __tablename__ = "invoice_counters"

    business_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), primary_key=True
    )
    next_number: Mapped[int] = mapped_column(nullable=False, default=1, server_default="1")


class PaymentInstallmentPlan(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "payment_installment_plans"
    __table_args__ = (
        UniqueConstraint("order_id", name="uq_payment_installment_plans_order_id"),
        Index("ix_payment_installment_plans_business_id", "business_id"),
        CheckConstraint("advance_amount IS NULL OR advance_amount >= 0", name="advance_amount_nonnegative"),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    advance_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    advance_due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    order: Mapped[Order] = relationship(back_populates="payment_plan")
    installments: Mapped[list[PaymentInstallment]] = relationship(
        back_populates="plan", cascade="all, delete-orphan", order_by="PaymentInstallment.position"
    )
    allocations: Mapped[list[PaymentAllocation]] = relationship(
        back_populates="plan", cascade="all, delete-orphan"
    )


class PaymentInstallment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "payment_installments"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("position > 0", name="position_positive"),
        Index("ix_payment_installments_due_date", "due_date"),
    )

    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("payment_installment_plans.id", ondelete="CASCADE"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    position: Mapped[int] = mapped_column(nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)

    plan: Mapped[PaymentInstallmentPlan] = relationship(back_populates="installments")
    allocations: Mapped[list[PaymentAllocation]] = relationship(back_populates="installment")


class PaymentAllocation(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "payment_allocations"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint(
            "(installment_id IS NOT NULL AND is_advance = false) OR "
            "(installment_id IS NULL AND is_advance = true)",
            name="target_exactly_one",
        ),
        Index("ix_payment_allocations_payment_id", "payment_id"),
    )

    payment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("payments.id", ondelete="CASCADE"), nullable=False
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("payment_installment_plans.id", ondelete="CASCADE"), nullable=False
    )
    installment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("payment_installments.id", ondelete="CASCADE"), nullable=True
    )
    is_advance: Mapped[bool] = mapped_column(nullable=False, default=False, server_default="false")
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    payment: Mapped[Payment] = relationship(back_populates="allocations")
    plan: Mapped[PaymentInstallmentPlan] = relationship(back_populates="allocations")
    installment: Mapped[PaymentInstallment | None] = relationship(back_populates="allocations")


class Payment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        Index("ix_payments_business_status_paid_at", "business_id", "status", "paid_at"),
        Index("ix_payments_order_id_paid_at", "order_id", "paid_at"),
        Index("ix_payments_customer_id_paid_at", "customer_id", "paid_at"),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_method: Mapped[PaymentMethod] = mapped_column(
        Enum(PaymentMethod, name="payment_method"), nullable=False
    )
    status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="payment_status"), nullable=False
    )
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    business: Mapped[Business] = relationship(back_populates="payments")
    order: Mapped[Order] = relationship(back_populates="payments")
    customer: Mapped[Customer] = relationship(back_populates="payments")
    received_by_user: Mapped[User] = relationship(back_populates="received_payments")
    allocations: Mapped[list[PaymentAllocation]] = relationship(
        back_populates="payment", cascade="all, delete-orphan"
    )


class Invoice(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint("order_id", name="uq_invoices_order_id"),
        UniqueConstraint("business_id", "invoice_number", name="uq_invoices_business_number"),
        Index("ix_invoices_business_id", "business_id"),
        Index("ix_invoices_customer_id", "customer_id"),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    invoice_number: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[InvoiceStatus] = mapped_column(
        Enum(InvoiceStatus, name="invoice_status"), nullable=False
    )
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    business: Mapped[Business] = relationship(back_populates="invoices")
    order: Mapped[Order] = relationship(back_populates="invoice")
    customer: Mapped[Customer] = relationship(back_populates="invoices")
    created_by_user: Mapped[User] = relationship(back_populates="created_invoices")
