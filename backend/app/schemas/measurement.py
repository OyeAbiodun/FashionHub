import math
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    field_serializer,
    field_validator,
    model_validator,
)

from app.core.measurement_defaults import normalize_field_key
from app.models.measurement import MeasurementFieldType, MeasurementUnit
from app.schemas.customer import blank_to_none


class MeasurementTemplateFieldResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    field_name: str
    field_key: str
    description: str | None
    field_type: MeasurementFieldType
    position: int
    is_required: bool
    unit_hint: str | None
    default_value: Decimal | None
    is_active: bool

    @field_serializer("default_value")
    def serialize_default_value(self, value: Decimal | None) -> str | None:
        return str(value) if value is not None else None


class MeasurementTemplateListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    garment_type: str
    is_system_template: bool
    is_active: bool


class MeasurementTemplateResponse(MeasurementTemplateListItem):
    description: str | None
    fields: list[MeasurementTemplateFieldResponse]


class MeasurementTemplateFieldWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID | None = None
    field_name: str = Field(
        min_length=1,
        max_length=120,
        validation_alias=AliasChoices("field_name", "name", "label"),
    )
    field_key: str | None = Field(
        default=None,
        min_length=1,
        max_length=120,
        validation_alias=AliasChoices("field_key", "key"),
    )
    description: str | None = Field(default=None, max_length=2000)
    field_type: MeasurementFieldType = MeasurementFieldType.NUMBER
    position: int = Field(ge=1)
    is_required: bool = Field(
        default=True,
        validation_alias=AliasChoices("is_required", "required"),
    )
    unit_hint: str | None = Field(
        default=None,
        max_length=40,
        validation_alias=AliasChoices("unit_hint", "unit"),
    )
    default_value: Decimal | None = Field(default=None, ge=0, max_digits=8, decimal_places=2)
    is_active: bool = True

    @field_validator("field_name", mode="before")
    @classmethod
    def trim_field_name(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value

    @field_validator("field_key", mode="before")
    @classmethod
    def normalize_key(cls, value: str | None) -> str | None:
        return normalize_field_key(value) if isinstance(value, str) else value

    @field_validator("description", "unit_hint", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        return blank_to_none(value)

    @model_validator(mode="after")
    def derive_key_from_name(self) -> "MeasurementTemplateFieldWrite":
        self.field_key = self.field_key or normalize_field_key(self.field_name)
        if not self.field_key:
            raise ValueError("Measurement field key cannot be empty.")
        return self


class MeasurementTemplateCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=150)
    garment_type: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=5000)
    fields: list[MeasurementTemplateFieldWrite] = Field(min_length=1)

    @field_validator("name", "garment_type", mode="before")
    @classmethod
    def trim_required_strings(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value

    @field_validator("description", mode="before")
    @classmethod
    def normalize_optional_description(cls, value: str | None) -> str | None:
        return blank_to_none(value)

    @model_validator(mode="after")
    def fields_must_have_unique_keys(self) -> "MeasurementTemplateCreate":
        keys = [field.field_key for field in self.fields]
        if len(keys) != len(set(keys)):
            raise ValueError("Measurement template fields cannot contain duplicate keys.")
        return self


class MeasurementTemplateUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=150)
    garment_type: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=5000)
    is_active: bool | None = None
    fields: list[MeasurementTemplateFieldWrite] | None = None

    @field_validator("name", "garment_type", mode="before")
    @classmethod
    def trim_required_strings(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value

    @field_validator("description", mode="before")
    @classmethod
    def normalize_optional_description(cls, value: str | None) -> str | None:
        return blank_to_none(value)

    @model_validator(mode="after")
    def fields_must_have_unique_keys(self) -> "MeasurementTemplateUpdate":
        if self.fields is None:
            return self
        keys = [field.field_key for field in self.fields]
        if len(keys) != len(set(keys)):
            raise ValueError("Measurement template fields cannot contain duplicate keys.")
        return self


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


class MeasurementValueUpdate(BaseModel):
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


class MeasurementProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=150)
    garment_type: str | None = Field(default=None, min_length=1, max_length=80)
    unit: MeasurementUnit | None = None
    notes: str | None = Field(default=None, max_length=5000)
    values: list[MeasurementValueUpdate] | None = None

    @field_validator("name", "garment_type", mode="before")
    @classmethod
    def trim_required_strings(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value

    @field_validator("notes", mode="before")
    @classmethod
    def normalize_optional_notes(cls, value: str | None) -> str | None:
        return blank_to_none(value)

    @model_validator(mode="after")
    def values_must_have_unique_keys(self) -> "MeasurementProfileUpdate":
        if self.values is None:
            return self
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
