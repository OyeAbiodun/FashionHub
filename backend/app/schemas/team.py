from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.permissions import AVAILABLE_PERMISSIONS
from app.models.user import UserRole


class StaffPublic(BaseModel):
  model_config = ConfigDict(from_attributes=True)

  id: UUID
  business_id: UUID
  first_name: str
  last_name: str
  email: str
  phone: str | None
  role: UserRole
  permissions: list[str] | None
  custom_role_id: UUID | None
  is_active: bool


class StaffCreate(BaseModel):
  model_config = ConfigDict(extra="forbid")

  first_name: str = Field(min_length=1, max_length=100)
  last_name: str = Field(min_length=1, max_length=100)
  email: EmailStr
  phone: str | None = Field(default=None, max_length=40)
  password: str = Field(min_length=8, max_length=128)
  role: UserRole = UserRole.STAFF
  permissions: list[str] | None = None
  custom_role_id: UUID | None = None

  @field_validator("email")
  @classmethod
  def normalize_email(cls, value: str) -> str:
    return value.strip().lower()

  @field_validator("permissions")
  @classmethod
  def validate_permissions(cls, value: list[str] | None) -> list[str] | None:
    if value is None:
      return None
    valid_set = AVAILABLE_PERMISSIONS
    for p in value:
      if p not in valid_set:
        raise ValueError(f"Invalid permission: {p}")
    return list(set(value))


class StaffUpdate(BaseModel):
  model_config = ConfigDict(extra="forbid")

  first_name: str | None = Field(default=None, min_length=1, max_length=100)
  last_name: str | None = Field(default=None, min_length=1, max_length=100)
  phone: str | None = Field(default=None, max_length=40)
  role: UserRole | None = None
  permissions: list[str] | None = None
  custom_role_id: UUID | None = None
  is_active: bool | None = None

  @field_validator("permissions")
  @classmethod
  def validate_permissions(cls, value: list[str] | None) -> list[str] | None:
    if value is None:
      return None
    valid_set = AVAILABLE_PERMISSIONS
    for p in value:
      if p not in valid_set:
        raise ValueError(f"Invalid permission: {p}")
    return list(set(value))
