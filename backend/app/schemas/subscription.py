from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.business import SUPPORTED_CURRENCIES

SUBSCRIPTION_FEATURES = {
    "customers",
    "measurements",
    "templates",
    "orders",
    "invoices",
    "reports",
    "team",
    "tasks",
    "installment_plans",
    "audit",
    "inventory",
    "communication",
}


class SubscriptionPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{0,63}$")
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)
    monthly_price: str = Field(default="0.00", min_length=1, max_length=24)
    currency: str = "NGN"
    features: list[str] = Field(default_factory=list, max_length=len(SUBSCRIPTION_FEATURES))
    max_staff_users: int = Field(default=10, ge=1, le=1000)
    is_active: bool = True

    @field_validator("name", "description", mode="before")
    @classmethod
    def trim_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("monthly_price")
    @classmethod
    def validate_price(cls, value: str) -> str:
        try:
            amount = Decimal(value)
        except InvalidOperation as exc:
            raise ValueError("Monthly price must be a valid decimal amount") from exc
        if not amount.is_finite() or amount < 0 or amount > Decimal("999999999999.99"):
            raise ValueError("Monthly price must be between 0 and 999999999999.99")
        return f"{amount:.2f}"

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, value: str) -> str:
        normalized = value.upper()
        if normalized not in SUPPORTED_CURRENCIES:
            raise ValueError("Unsupported subscription currency")
        return normalized

    @field_validator("features")
    @classmethod
    def validate_features(cls, value: list[str]) -> list[str]:
        invalid = any(feature not in SUBSCRIPTION_FEATURES for feature in value)
        if len(value) != len(set(value)) or invalid:
            raise ValueError("Choose each supported feature at most once")
        return value


class PlatformSubscriptionConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool = False
    plans: list[SubscriptionPlan] = Field(default_factory=list, max_length=20)
    billing_provider: str = "MANUAL"
    billing_mode: str = "TEST"
    billing_secret_configured: bool = False
    billing_webhook_secret_configured: bool = False
    provider_credentials: dict[str, dict[str, dict[str, object]]] = Field(default_factory=dict)

    @field_validator("billing_provider")
    @classmethod
    def validate_billing_provider(cls, value: str) -> str:
        normalized = value.upper()
        if normalized not in {"MANUAL", "STRIPE", "PAYSTACK", "FLUTTERWAVE"}:
            raise ValueError("Choose a supported billing provider")
        return normalized

    @field_validator("billing_mode")
    @classmethod
    def validate_billing_mode(cls, value: str) -> str:
        normalized = value.upper()
        if normalized not in {"TEST", "LIVE"}:
            raise ValueError("Billing mode must be TEST or LIVE")
        return normalized

    @model_validator(mode="after")
    def validate_catalog(self) -> Self:
        ids = [plan.id for plan in self.plans]
        if len(ids) != len(set(ids)):
            raise ValueError("Subscription plan IDs must be unique")
        if any(plan.is_active and not plan.features for plan in self.plans):
            raise ValueError("Every active plan must include at least one feature")
        if self.enabled and not any(plan.is_active for plan in self.plans):
            raise ValueError("Add at least one active plan before requiring subscriptions")
        return self


class PlatformSubscriptionConfigurationUpdate(PlatformSubscriptionConfiguration):
    billing_secret: str | None = Field(default=None, min_length=1, max_length=4096)
    billing_webhook_secret: str | None = Field(default=None, min_length=1, max_length=4096)


class BillingProviderTestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    billing_provider: str
    billing_mode: str = "TEST"
    billing_secret: str | None = Field(default=None, min_length=1, max_length=4096)

    @field_validator("billing_provider")
    @classmethod
    def validate_billing_provider(cls, value: str) -> str:
        normalized = value.upper()
        if normalized not in {"STRIPE", "PAYSTACK", "FLUTTERWAVE"}:
            raise ValueError("Choose an online billing provider to test")
        return normalized

    @field_validator("billing_mode")
    @classmethod
    def validate_billing_mode(cls, value: str) -> str:
        normalized = value.upper()
        if normalized not in {"TEST", "LIVE"}:
            raise ValueError("Billing mode must be TEST or LIVE")
        return normalized


class BillingProviderTestResult(BaseModel):
    billing_provider: str
    billing_mode: str
    connected: bool
    message: str


class SubscriptionPlanSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan_id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{0,63}$")


class SubscriptionCheckoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan_id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{0,63}$")


class SubscriptionCheckoutResponse(BaseModel):
    provider: str
    reference: str
    checkout_url: str


class SubscriptionCheckoutVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reference: str = Field(min_length=8, max_length=120)
    transaction_id: str | None = Field(default=None, max_length=120)
    checkout_session_id: str | None = Field(default=None, max_length=120)


class SubscriptionBillingStatus(BaseModel):
    status: str
    plan_id: str
    plan_name: str
    amount: str
    currency: str
    provider: str
    reference: str
    period_end: datetime | None = None
    created_at: datetime | None = None
    cancel_at_period_end: bool = False


class SubscriptionStatus(BaseModel):
    required: bool
    can_use_app: bool
    plans: list[SubscriptionPlan]
    selected_plan: SubscriptionPlan | None
    selected_at: datetime | None
    billing_provider: str = "MANUAL"
    billing_mode: str = "TEST"
    subscription_status: str | None = None
    period_end: datetime | None = None
    cancel_at_period_end: bool = False
    automatic_renewal: bool = False
    can_cancel_renewal: bool = False


class SubscriptionCancellationResponse(BaseModel):
    message: str
    period_end: datetime | None = None
