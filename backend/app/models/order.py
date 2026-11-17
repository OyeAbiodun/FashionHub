from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
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
    from app.models.finance import Invoice, Payment, PaymentInstallmentPlan
    from app.models.fulfillment import OrderFulfillment
    from app.models.measurement import MeasurementProfile
    from app.models.user import User


class OrderStatus(StrEnum):
    DRAFT = "DRAFT"
    CONFIRMED = "CONFIRMED"
    CUTTING = "CUTTING"
    SEWING = "SEWING"
    FITTING = "FITTING"
    FINISHING = "FINISHING"
    READY = "READY"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"


class OrderCounter(Base):
    __tablename__ = "order_counters"

    business_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), primary_key=True
    )
    next_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")


class Order(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint("discount_amount >= 0", name="discount_nonnegative"),
        CheckConstraint("delivery_charge >= 0", name="delivery_charge_nonnegative"),
        UniqueConstraint("business_id", "order_number", name="uq_orders_business_id_order_number"),
        Index("ix_orders_business_id", "business_id"),
        Index("ix_orders_business_id_status", "business_id", "status"),
        Index("ix_orders_business_id_due_date", "business_id", "due_date"),
        Index("ix_orders_customer_id", "customer_id"),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    order_number: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="order_status"), nullable=False, default=OrderStatus.CONFIRMED
    )
    order_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    reference_image: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    discount_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default="0.00"
    )
    delivery_charge: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default="0.00"
    )

    business: Mapped[Business] = relationship(back_populates="orders")
    customer: Mapped[Customer] = relationship(back_populates="orders")
    created_by_user: Mapped[User] = relationship(back_populates="created_orders")
    items: Mapped[list[OrderItem]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderItem.position",
    )
    status_history: Mapped[list[OrderStatusHistory]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderStatusHistory.changed_at",
    )
    payments: Mapped[list[Payment]] = relationship(back_populates="order")
    invoice: Mapped[Invoice | None] = relationship(back_populates="order", uselist=False)
    payment_plan: Mapped[PaymentInstallmentPlan | None] = relationship(
        back_populates="order", uselist=False, cascade="all, delete-orphan"
    )
    fulfillment: Mapped[OrderFulfillment | None] = relationship(
        back_populates="order", uselist=False, cascade="all, delete-orphan"
    )


class OrderItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint("unit_price >= 0", name="unit_price_nonnegative"),
        Index("ix_order_items_order_id", "order_id"),
        Index("ix_order_items_measurement_profile_id", "measurement_profile_id"),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    garment_type: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    unit_price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default="0.00"
    )
    measurement_profile_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("measurement_profiles.id", ondelete="SET NULL"), nullable=True
    )
    style_reference_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[OrderStatus | None] = mapped_column(
        Enum(OrderStatus, name="order_status"), nullable=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)

    order: Mapped[Order] = relationship(back_populates="items")
    measurement_profile: Mapped[MeasurementProfile | None] = relationship(
        back_populates="order_items"
    )


class OrderStatusHistory(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "order_status_history"
    __table_args__ = (
        Index("ix_order_status_history_order_id", "order_id"),
        Index("ix_order_status_history_changed_at", "changed_at"),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    previous_status: Mapped[OrderStatus | None] = mapped_column(
        Enum(OrderStatus, name="order_status"), nullable=True
    )
    new_status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="order_status"), nullable=False
    )
    changed_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    order: Mapped[Order] = relationship(back_populates="status_history")
    changed_by_user: Mapped[User] = relationship(back_populates="order_status_changes")
