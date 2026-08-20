from __future__ import annotations

import uuid
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, Enum, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.finance import Invoice, Payment
    from app.models.measurement import MeasurementProfile
    from app.models.order import Order, OrderStatusHistory
    from app.models.role import Role


class UserRole(StrEnum):
    SUPER_ADMIN = "SUPER_ADMIN"
    BUSINESS_ADMIN = "BUSINESS_ADMIN"
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
    permissions: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    custom_role_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("roles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    business: Mapped[Business] = relationship(back_populates="users")
    custom_role: Mapped[Role | None] = relationship("Role", back_populates="users", lazy="selectin")
    recorded_measurement_profiles: Mapped[list[MeasurementProfile]] = relationship(
        back_populates="recorded_by_user"
    )
    created_orders: Mapped[list[Order]] = relationship(back_populates="created_by_user")
    order_status_changes: Mapped[list[OrderStatusHistory]] = relationship(
        back_populates="changed_by_user"
    )
    received_payments: Mapped[list[Payment]] = relationship(back_populates="received_by_user")
    created_invoices: Mapped[list[Invoice]] = relationship(back_populates="created_by_user")
