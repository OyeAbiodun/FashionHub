from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PlatformMetrics(BaseModel):
    total_businesses: int
    active_businesses: int
    total_users: int
    total_customers: int
    total_orders: int
    total_revenue: str


class BusinessTenantDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    email: str | None
    phone: str
    address: str | None
    logo_url: str | None
    currency: str
    timezone: str
    enabled_features: list[str]
    max_staff_users: int
    is_active: bool
    created_at: datetime
    user_count: int = 0
    customer_count: int = 0
    order_count: int = 0
    total_revenue: str = "0.00"


class UpdateBusinessEntitlements(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled_features: list[str] = Field(min_length=1)
    max_staff_users: int = Field(ge=1, le=1000)

    @field_validator("enabled_features")
    @classmethod
    def validate_features(cls, value: list[str]) -> list[str]:
        valid = {"customers", "measurements", "templates", "orders", "invoices", "reports", "team"}
        for item in value:
            if item not in valid:
                raise ValueError(f"Invalid feature module: {item}")
        return list(set(value))


class PlatformActivityItem(BaseModel):
    id: str
    type: str  # "BUSINESS_REGISTERED", "ORDER_CREATED", "PAYMENT_RECEIVED"
    title: str
    description: str
    business_name: str
    timestamp: datetime
