from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.user import UserRole


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    business_id: UUID
    first_name: str
    last_name: str
    email: str
    phone: str | None
    role: UserRole
    is_active: bool


class UserRegister(BaseModel):
    model_config = ConfigDict(extra="forbid")

    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=40)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=40)

    @field_validator("first_name", "last_name", mode="before")
    @classmethod
    def trim_name_fields(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value

    @field_validator("phone", mode="before")
    @classmethod
    def trim_phone(cls, value: str | None) -> str | None:
        if isinstance(value, str):
            trimmed = value.strip()
            return trimmed if trimmed else None
        return value


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)

