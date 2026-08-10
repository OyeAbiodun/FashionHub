from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.customer import Customer
    from app.models.order import OrderItem
    from app.models.user import User


class MeasurementUnit(StrEnum):
    INCH = "INCH"
    CM = "CM"


class MeasurementTemplate(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "measurement_templates"
    __table_args__ = (
        Index("ix_measurement_templates_business_id", "business_id"),
        Index("ix_measurement_templates_business_id_is_active", "business_id", "is_active"),
    )

    business_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    garment_type: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_system_template: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    business: Mapped[Business | None] = relationship(back_populates="measurement_templates")
    fields: Mapped[list[MeasurementTemplateField]] = relationship(
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="MeasurementTemplateField.position",
    )
    profiles: Mapped[list[MeasurementProfile]] = relationship(back_populates="template")


class MeasurementTemplateField(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "measurement_template_fields"
    __table_args__ = (
        Index("ix_measurement_template_fields_template_id", "template_id"),
        Index("ix_measurement_template_fields_template_id_position", "template_id", "position"),
    )

    template_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("measurement_templates.id", ondelete="CASCADE"), nullable=False
    )
    field_name: Mapped[str] = mapped_column(String(120), nullable=False)
    field_key: Mapped[str] = mapped_column(String(120), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    is_required: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    unit_hint: Mapped[str | None] = mapped_column(String(40), nullable=True)

    template: Mapped[MeasurementTemplate] = relationship(back_populates="fields")


class MeasurementProfile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "measurement_profiles"
    __table_args__ = (
        Index("ix_measurement_profiles_business_id", "business_id"),
        Index("ix_measurement_profiles_customer_id", "customer_id"),
        Index("ix_measurement_profiles_business_id_archived_at", "business_id", "archived_at"),
        Index("ix_measurement_profiles_customer_id_recorded_at", "customer_id", "recorded_at"),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("measurement_templates.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    garment_type: Mapped[str] = mapped_column(String(80), nullable=False)
    unit: Mapped[MeasurementUnit] = mapped_column(
        Enum(MeasurementUnit, name="measurement_unit"), nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    recorded_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    business: Mapped[Business] = relationship(back_populates="measurement_profiles")
    customer: Mapped[Customer] = relationship(back_populates="measurement_profiles")
    template: Mapped[MeasurementTemplate | None] = relationship(back_populates="profiles")
    recorded_by_user: Mapped[User] = relationship(back_populates="recorded_measurement_profiles")
    values: Mapped[list[MeasurementValue]] = relationship(
        back_populates="measurement_profile",
        cascade="all, delete-orphan",
        order_by="MeasurementValue.position",
    )
    order_items: Mapped[list[OrderItem]] = relationship(back_populates="measurement_profile")


class MeasurementValue(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "measurement_values"
    __table_args__ = (
        Index("ix_measurement_values_measurement_profile_id", "measurement_profile_id"),
        Index(
            "ix_measurement_values_measurement_profile_id_position",
            "measurement_profile_id",
            "position",
        ),
    )

    measurement_profile_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("measurement_profiles.id", ondelete="CASCADE"), nullable=False
    )
    field_name: Mapped[str] = mapped_column(String(120), nullable=False)
    field_key: Mapped[str] = mapped_column(String(120), nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)

    measurement_profile: Mapped[MeasurementProfile] = relationship(back_populates="values")
