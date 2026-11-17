from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class CommunicationChannel(StrEnum):
    WHATSAPP = "WHATSAPP"
    SMS = "SMS"
    EMAIL = "EMAIL"


class CommunicationStatus(StrEnum):
    PREPARED = "PREPARED"
    SENT = "SENT"
    FAILED = "FAILED"


class MessageTemplate(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "message_templates"
    __table_args__ = (Index("ix_message_templates_business_active", "business_id", "is_active"),)

    business_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    channel: Mapped[CommunicationChannel] = mapped_column(
        Enum(CommunicationChannel, name="communication_channel"), nullable=False
    )
    subject: Mapped[str | None] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True, server_default="true")


class Communication(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "communications"
    __table_args__ = (
        Index("ix_communications_business_created", "business_id", "created_at"),
        Index("ix_communications_business_customer", "business_id", "customer_id"),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False
    )
    order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"))
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("message_templates.id", ondelete="SET NULL")
    )
    channel: Mapped[CommunicationChannel] = mapped_column(
        Enum(CommunicationChannel, name="communication_channel", create_type=False), nullable=False
    )
    status: Mapped[CommunicationStatus] = mapped_column(
        Enum(CommunicationStatus, name="communication_status"),
        nullable=False,
        default=CommunicationStatus.PREPARED,
    )
    recipient: Mapped[str] = mapped_column(String(320), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    handoff_url: Mapped[str] = mapped_column(Text, nullable=False)
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    customer = relationship("Customer", lazy="selectin")
    order = relationship("Order", lazy="selectin")
    template = relationship("MessageTemplate", lazy="selectin")
    created_by = relationship("User", lazy="selectin")
    attempts: Mapped[list[CommunicationAttempt]] = relationship(
        back_populates="communication",
        cascade="all, delete-orphan",
        order_by="CommunicationAttempt.created_at",
    )


class CommunicationAttempt(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "communication_attempts"
    __table_args__ = (
        Index("ix_communication_attempts_communication_created", "communication_id", "created_at"),
    )

    communication_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("communications.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[CommunicationStatus] = mapped_column(
        Enum(CommunicationStatus, name="communication_status", create_type=False), nullable=False
    )
    note: Mapped[str | None] = mapped_column(String(500))
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    communication: Mapped[Communication] = relationship(back_populates="attempts")
    created_by = relationship("User", lazy="selectin")
