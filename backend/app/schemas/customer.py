from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


def blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class CustomerBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    last_name: str | None = Field(default=None, max_length=100)
    alternate_phone: str | None = Field(default=None, max_length=40)
    email: EmailStr | None = None
    gender: str | None = Field(default=None, max_length=40)
    birthday: date | None = None
    address: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=5000)

    @field_validator("last_name", "alternate_phone", "gender", "address", "notes", mode="before")
    @classmethod
    def normalize_optional_string(cls, value: str | None) -> str | None:
        return blank_to_none(value)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_optional_email(cls, value: str | None) -> str | None:
        normalized = blank_to_none(value)
        return normalized.lower() if normalized else None

    @field_validator("birthday")
    @classmethod
    def birthday_cannot_be_in_the_future(cls, value: date | None) -> date | None:
        if value is not None and value > date.today():
            raise ValueError("Birthday cannot be in the future")
        return value


class CustomerCreate(CustomerBase):
    first_name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=1, max_length=40)

    @field_validator("first_name", "phone", mode="before")
    @classmethod
    def normalize_required_string(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class CustomerUpdate(CustomerBase):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    phone: str | None = Field(default=None, min_length=1, max_length=40)

    @field_validator("first_name", "phone", mode="before")
    @classmethod
    def normalize_editable_string(cls, value: str | None) -> str | None:
        return blank_to_none(value)


class CustomerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    first_name: str
    last_name: str | None
    phone: str
    alternate_phone: str | None
    email: str | None
    gender: str | None
    birthday: date | None
    address: str | None
    notes: str | None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


class CustomerListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    first_name: str
    last_name: str | None
    phone: str
    email: str | None
    archived_at: datetime | None
    created_at: datetime


class CustomerListResponse(BaseModel):
    items: list[CustomerListItem]
    page: int
    page_size: int
    total: int
    total_pages: int
