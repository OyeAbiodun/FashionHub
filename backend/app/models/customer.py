from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.finance import Invoice, Payment
    from app.models.measurement import MeasurementProfile
    from app.models.order import Order


class Customer(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "customers"
    __table_args__ = (
        UniqueConstraint(
            "business_id",
            "phone_normalized",
            name="uq_customers_business_id_phone_normalized",
        ),
        Index("ix_customers_business_id", "business_id"),
        Index("ix_customers_business_id_archived_at", "business_id", "archived_at"),
        Index("ix_customers_business_id_first_name", "business_id", "first_name"),
        Index("ix_customers_business_id_phone_normalized", "business_id", "phone_normalized"),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"))
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    phone: Mapped[str] = mapped_column(String(40), nullable=False)
    phone_normalized: Mapped[str] = mapped_column(String(40), nullable=False)
    alternate_phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    gender: Mapped[str | None] = mapped_column(String(40), nullable=True)
    birthday: Mapped[date | None] = mapped_column(Date, nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    business: Mapped[Business] = relationship(back_populates="customers")
    measurement_profiles: Mapped[list[MeasurementProfile]] = relationship(
        back_populates="customer", cascade="all, delete-orphan"
    )
    orders: Mapped[list[Order]] = relationship(
        back_populates="customer", cascade="all, delete-orphan"
    )
    payments: Mapped[list[Payment]] = relationship(back_populates="customer")
    invoices: Mapped[list[Invoice]] = relationship(back_populates="customer")
