import math
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_serializer,
    field_validator,
    model_validator,
)

from app.core.measurement_defaults import normalize_field_key
from app.models.measurement import MeasurementUnit
from app.schemas.customer import blank_to_none


class MeasurementTemplateFieldResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    field_name: str
    field_key: str
    position: int
    is_required: bool
    unit_hint: str | None


class MeasurementTemplateListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    garment_type: str
    is_system_template: bool


class MeasurementTemplateResponse(MeasurementTemplateListItem):
    description: str | None
    fields: list[MeasurementTemplateFieldResponse]


class MeasurementValueCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field_key: str = Field(min_length=1, max_length=120)
    field_name: str = Field(min_length=1, max_length=120)
    value: Decimal = Field(ge=0, max_digits=8, decimal_places=2)
    notes: str | None = Field(default=None, max_length=2000)
    position: int = Field(ge=1)

    @field_validator("field_key", "field_name", mode="before")
    @classmethod
    def trim_required_strings(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value

    @field_validator("notes", mode="before")
    @classmethod
    def normalize_optional_notes(cls, value: str | None) -> str | None:
        return blank_to_none(value)


class MeasurementProfileCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    template_id: UUID
    name: str = Field(min_length=1, max_length=150)
    garment_type: str = Field(min_length=1, max_length=80)
    unit: MeasurementUnit
    notes: str | None = Field(default=None, max_length=5000)
    recorded_at: datetime | None = None
    values: list[MeasurementValueCreate] = Field(min_length=1)

    @field_validator("name", "garment_type", mode="before")
    @classmethod
    def trim_required_strings(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value

    @field_validator("notes", mode="before")
    @classmethod
    def normalize_optional_notes(cls, value: str | None) -> str | None:
        return blank_to_none(value)

    @model_validator(mode="after")
    def values_must_have_unique_keys(self) -> "MeasurementProfileCreate":
        keys = [normalize_field_key(value.field_key) for value in self.values]
        if len(keys) != len(set(keys)):
            raise ValueError("Measurement values cannot contain duplicate field_key entries.")
        return self


class MeasurementValueResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    field_name: str
    field_key: str
    value: Decimal
    notes: str | None
    position: int

    @field_serializer("value")
    def serialize_value(self, value: Decimal) -> str:
        return str(value)


class MeasurementProfileResponse(BaseModel):
    id: UUID
    customer_id: UUID
    template_id: UUID | None
    template_name: str | None
    name: str
    garment_type: str
    unit: MeasurementUnit
    notes: str | None
    recorded_at: datetime
    recorded_by: UUID
    recorded_by_name: str
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
    values: list[MeasurementValueResponse]


class MeasurementProfileListItem(BaseModel):
    id: UUID
    name: str
    garment_type: str
    unit: MeasurementUnit
    template_name: str | None
    recorded_at: datetime
    recorded_by_name: str
    archived_at: datetime | None
    value_count: int


class MeasurementProfileListResponse(BaseModel):
    items: list[MeasurementProfileListItem]
    page: int
    page_size: int
    total: int
    total_pages: int


class GlobalMeasurementProfileListItem(BaseModel):
    profile_id: UUID
    profile_name: str
    garment_type: str
    unit: MeasurementUnit
    recorded_at: datetime
    archived_at: datetime | None
    value_count: int
    customer_id: UUID
    customer_name: str
    customer_phone: str
    template_name: str | None
    recorded_by_name: str | None


class GlobalMeasurementProfileListResponse(BaseModel):
    items: list[GlobalMeasurementProfileListItem]
    page: int
    page_size: int
    total: int
    total_pages: int


def total_pages(total: int, page_size: int) -> int:
    return math.ceil(total / page_size) if total else 0
