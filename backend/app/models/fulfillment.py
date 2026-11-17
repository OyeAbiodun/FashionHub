from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.order import Order
    from app.models.user import User


class FulfillmentMethod(StrEnum):
    PICKUP = "PICKUP"
    DELIVERY = "DELIVERY"


class FulfillmentStatus(StrEnum):
    PLANNED = "PLANNED"
    OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY"
    COMPLETED = "COMPLETED"


class FulfillmentEventType(StrEnum):
    CONFIGURED = "CONFIGURED"
    UPDATED = "UPDATED"
    DISPATCHED = "DISPATCHED"
    HANDED_OFF = "HANDED_OFF"


class OrderFulfillment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "order_fulfillments"
    __table_args__ = (
        UniqueConstraint("order_id", name="uq_order_fulfillments_order_id"),
        Index("ix_order_fulfillments_business_status", "business_id", "status"),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    method: Mapped[FulfillmentMethod] = mapped_column(
        Enum(FulfillmentMethod, name="fulfillment_method"), nullable=False
    )
    status: Mapped[FulfillmentStatus] = mapped_column(
        Enum(FulfillmentStatus, name="fulfillment_status"), nullable=False,
        default=FulfillmentStatus.PLANNED,
    )
    recipient_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    recipient_phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    delivery_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    delivery_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    tracking_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    proof_of_delivery_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    updated_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    order: Mapped[Order] = relationship(back_populates="fulfillment")
    events: Mapped[list[OrderFulfillmentEvent]] = relationship(
        back_populates="fulfillment", cascade="all, delete-orphan", order_by="OrderFulfillmentEvent.occurred_at"
    )


class OrderFulfillmentEvent(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "order_fulfillment_events"
    __table_args__ = (
        Index("ix_order_fulfillment_events_fulfillment_occurred", "fulfillment_id", "occurred_at"),
    )

    fulfillment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("order_fulfillments.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[FulfillmentEventType] = mapped_column(
        Enum(FulfillmentEventType, name="fulfillment_event_type"), nullable=False
    )
    actor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    fulfillment: Mapped[OrderFulfillment] = relationship(back_populates="events")
    actor: Mapped[User] = relationship()
