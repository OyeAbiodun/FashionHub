from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.customer import blank_to_none

SUPPORTED_CURRENCIES = {"NGN", "USD", "GBP", "EUR", "GHS", "KES", "ZAR"}


class BusinessCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    phone: str = Field(min_length=1, max_length=40)
    email: EmailStr | None = None
    address: str | None = Field(default=None, max_length=500)


class BusinessPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    email: str | None
    phone: str
    address: str | None
    logo_url: str | None
    currency: str
    timezone: str
    invoice_notes: str | None
    invoice_footer: str | None
    enabled_features: list[str] = Field(default_factory=list)
    max_staff_users: int = 10
    is_active: bool = True


class BusinessUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    phone: str | None = Field(default=None, min_length=1, max_length=40)
    email: EmailStr | None = None
    address: str | None = Field(default=None, max_length=500)
    logo_url: str | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    invoice_notes: str | None = Field(default=None, max_length=5000)
    invoice_footer: str | None = Field(default=None, max_length=2000)

    @field_validator("name", "phone", mode="before")
    @classmethod
    def trim_required_fields(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value

    @field_validator("address", "logo_url", "invoice_notes", "invoice_footer", mode="before")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return blank_to_none(value)

    @field_validator("logo_url")
    @classmethod
    def validate_logo_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            return None
        if not (
            trimmed.startswith("http://")
            or trimmed.startswith("https://")
            or trimmed.startswith("data:image/")
        ):
            raise ValueError("Logo URL must be an http(s) URL or image upload")
        return trimmed

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.upper()
        if normalized not in SUPPORTED_CURRENCIES:
            raise ValueError("Unsupported currency")
        return normalized

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("Invalid IANA timezone") from exc
        return value
