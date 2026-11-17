import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class PlatformSubscriptionConfiguration(TimestampMixin, Base):
    __tablename__ = "platform_subscription_configurations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    plans: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    billing_provider: Mapped[str] = mapped_column(
        String(24), nullable=False, default="MANUAL", server_default="MANUAL"
    )
    billing_mode: Mapped[str] = mapped_column(
        String(12), nullable=False, default="TEST", server_default="TEST"
    )
    billing_secret_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    billing_webhook_secret_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    billing_secret_tested_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    billing_secret_tested_provider: Mapped[str | None] = mapped_column(String(24), nullable=True)
    billing_secret_tested_mode: Mapped[str | None] = mapped_column(String(12), nullable=True)
    billing_secret_tested_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    provider_credentials: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    provider_plan_codes: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)


class BusinessSubscription(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "business_subscriptions"
    __table_args__ = (
        UniqueConstraint("provider_reference", name="uq_business_subscription_reference"),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_id: Mapped[str] = mapped_column(String(64), nullable=False)
    plan_name: Mapped[str] = mapped_column(String(100), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    provider: Mapped[str] = mapped_column(String(24), nullable=False)
    billing_mode: Mapped[str] = mapped_column(String(12), nullable=False, default="TEST")
    provider_reference: Mapped[str] = mapped_column(String(120), nullable=False)
    provider_transaction_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    provider_subscription_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    provider_subscription_token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider_customer_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    checkout_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="PENDING")
    cancel_at_period_end: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class BusinessSubscriptionCharge(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "business_subscription_charges"
    __table_args__ = (
        UniqueConstraint("provider", "provider_charge_id", name="uq_subscription_provider_charge"),
    )

    business_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subscription_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("business_subscriptions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(24), nullable=False)
    provider_charge_id: Mapped[str] = mapped_column(String(160), nullable=False)
    reference: Mapped[str] = mapped_column(String(120), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class BillingWebhookEvent(TimestampMixin, Base):
    __tablename__ = "billing_webhook_events"
    __table_args__ = (
        UniqueConstraint("provider", "event_id", name="uq_billing_webhook_provider_event"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(String(24), nullable=False)
    event_id: Mapped[str] = mapped_column(String(160), nullable=False)
    event_type: Mapped[str] = mapped_column(String(120), nullable=False)
