from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.finance import Invoice, Payment
    from app.models.measurement import MeasurementProfile, MeasurementTemplate
    from app.models.order import Order
    from app.models.user import User

DEFAULT_BUSINESS_FEATURES = [
    "customers",
    "measurements",
    "templates",
    "orders",
    "invoices",
    "reports",
    "team",
]


class Business(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "businesses"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    phone: Mapped[str] = mapped_column(String(40), nullable=False)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    currency: Mapped[str] = mapped_column(
        String(3), nullable=False, default="NGN", server_default="NGN"
    )
    timezone: Mapped[str] = mapped_column(
        String(64), nullable=False, default="Africa/Lagos", server_default="Africa/Lagos"
    )
    invoice_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    invoice_footer: Mapped[str | None] = mapped_column(Text, nullable=True)
    enabled_features: Mapped[list[str]] = mapped_column(
        JSON,
        nullable=False,
        default=lambda: list(DEFAULT_BUSINESS_FEATURES),
    )
    max_staff_users: Mapped[int] = mapped_column(
        Integer, nullable=False, default=10, server_default="10"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    users: Mapped[list[User]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    customers: Mapped[list[Customer]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    measurement_templates: Mapped[list[MeasurementTemplate]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    measurement_profiles: Mapped[list[MeasurementProfile]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    orders: Mapped[list[Order]] = relationship(
        back_populates="business", cascade="all, delete-orphan"
    )
    payments: Mapped[list[Payment]] = relationship(back_populates="business")
    invoices: Mapped[list[Invoice]] = relationship(back_populates="business")
