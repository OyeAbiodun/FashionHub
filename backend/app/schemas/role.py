import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


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


class RoleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    permissions: list[str] | None = None
