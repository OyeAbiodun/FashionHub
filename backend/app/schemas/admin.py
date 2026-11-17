from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PlatformMetrics(BaseModel):
    total_businesses: int
    active_businesses: int
    total_users: int
    total_customers: int
    total_orders: int
    collected_by_currency: dict[str, str]


class SystemCheck(BaseModel):
    component: str
    status: str
    detail: str
    action: str | None = None


class PlatformSystemStatus(BaseModel):
    app_name: str
    environment: str
    debug: bool
    cookie_secure: bool
    api_status: str
    database_status: str
    database_dialect: str
    database_name: str
    database_host: str | None = None
    database_server_version: str
    database_size_bytes: int | None = None
    database_table_count: int
    database_pool: dict[str, int | None]
    migration_revision: str | None
    email_configured: bool
    email_last_test_status: str | None = None
    billing_provider: str
    billing_mode: str
    billing_key_configured: bool
    billing_webhook_configured: bool
    checks: list[SystemCheck]


class DatabaseQueryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    query: str = Field(min_length=6, max_length=4000)
    limit: int = Field(default=100, ge=1, le=200)


class DatabaseQueryResult(BaseModel):
    columns: list[str]
    rows: list[dict[str, object]]
    row_count: int
    truncated: bool
    elapsed_ms: int


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
    audit_configuration: dict[str, object] = Field(default_factory=dict)
    owner_name: str | None = None
    owner_email: str | None = None
    owner_phone: str | None = None
    active_user_count: int = 0
    user_count: int = 0
    customer_count: int = 0
    order_count: int = 0
    total_revenue: str = "0.00"
    subscription_plan_id: str | None = None
    subscription_selected_at: datetime | None = None


class UpdateBusinessEntitlements(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled_features: list[str] = Field(min_length=1)
    max_staff_users: int = Field(ge=1, le=1000)

    @field_validator("enabled_features")
    @classmethod
    def validate_features(cls, value: list[str]) -> list[str]:
        valid = {
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
    currency: str | None = None
    amount: str | None = None


class AdminAuditItem(BaseModel):
    id: UUID
    actor_name: str
    actor_email: str
    action: str
    summary: str
    business_id: UUID | None
    business_name: str | None
    details: dict[str, object]
    source_ip: str | None
    user_agent: str | None = None
    timestamp: datetime


class AuditCaptureConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool
    capture_ip: bool
    capture_device: bool
    capture_details: bool
