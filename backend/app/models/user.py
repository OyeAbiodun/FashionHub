from __future__ import annotations

import uuid
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Enum, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.finance import Invoice, Payment
    from app.models.measurement import MeasurementProfile
    from app.models.order import Order, OrderStatusHistory


class UserRole(StrEnum):
    OWNER = "OWNER"
    STAFF = "STAFF"


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_business_id", "business_id"),
        Index("ix_users_email", "email", unique=True),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("businesses.id", ondelete="CASCADE"))
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"), nullable=False, default=UserRole.STAFF
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    business: Mapped[Business] = relationship(back_populates="users")
    recorded_measurement_profiles: Mapped[list[MeasurementProfile]] = relationship(
        back_populates="recorded_by_user"
    )
    created_orders: Mapped[list[Order]] = relationship(back_populates="created_by_user")
    order_status_changes: Mapped[list[OrderStatusHistory]] = relationship(
        back_populates="changed_by_user"
    )
    received_payments: Mapped[list[Payment]] = relationship(back_populates="received_by_user")
    created_invoices: Mapped[list[Invoice]] = relationship(back_populates="created_by_user")
