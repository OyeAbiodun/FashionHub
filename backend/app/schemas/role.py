import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.permissions import AVAILABLE_PERMISSIONS


class RolePublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_id: uuid.UUID | None = None
    name: str
    description: str | None = None
    permissions: list[str] = Field(default_factory=list)
    is_system_role: bool = False
    created_at: datetime


class RoleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    permissions: list[str] = Field(default_factory=list)

    @field_validator("permissions")
    @classmethod
    def validate_permissions(cls, value: list[str]) -> list[str]:
        invalid = set(value) - AVAILABLE_PERMISSIONS
        if invalid:
            raise ValueError(f"Invalid permission: {sorted(invalid)[0]}")
        return list(set(value))


class RoleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    permissions: list[str] | None = None

    @field_validator("permissions")
    @classmethod
    def validate_permissions(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        invalid = set(value) - AVAILABLE_PERMISSIONS
        if invalid:
            raise ValueError(f"Invalid permission: {sorted(invalid)[0]}")
        return list(set(value))
