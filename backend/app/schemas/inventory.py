import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.inventory import StockMovementType

Quantity = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=3)]


class SupplierWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    contact_name: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=320)
    notes: str | None = Field(default=None, max_length=2000)


class SupplierPublic(SupplierWrite):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    id: uuid.UUID
    archived_at: datetime | None


class InventoryItemWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    sku: str | None = Field(default=None, max_length=80)
    unit: str = Field(min_length=1, max_length=40)
    reorder_level: Decimal = Field(default=Decimal("0"), ge=0, max_digits=12, decimal_places=3)
    supplier_id: uuid.UUID | None = None
    description: str | None = Field(default=None, max_length=2000)
    is_active: bool = True

    @field_validator("name", "unit", mode="before")
    @classmethod
    def strip_required(cls, value):
        return value.strip() if isinstance(value, str) else value


class InventoryItemPublic(InventoryItemWrite):
    id: uuid.UUID
    current_stock: Decimal
    is_low_stock: bool
    supplier_name: str | None
    created_at: datetime


class StockMovementCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    movement_type: StockMovementType
    quantity: Decimal = Field(max_digits=12, decimal_places=3)
    unit_cost: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("movement_type")
    @classmethod
    def manual_movement_types(cls, value):
        if value not in {StockMovementType.RECEIPT, StockMovementType.ADJUSTMENT}:
            raise ValueError("Consumption movements are created from order material usage")
        return value

    @field_validator("quantity")
    @classmethod
    def receipt_must_be_positive(cls, value, info):
        if value == 0:
            raise ValueError("Quantity must not be zero")
        if info.data.get("movement_type") == StockMovementType.RECEIPT and value <= 0:
            raise ValueError("Receipt quantity must be positive")
        return value


class StockMovementPublic(BaseModel):
    id: uuid.UUID
    item_id: uuid.UUID
    item_name: str
    order_id: uuid.UUID | None
    movement_type: StockMovementType
    quantity_delta: Decimal
    unit_cost: Decimal | None
    reason: str
    created_by_name: str
    created_at: datetime


class MaterialUsageCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    item_id: uuid.UUID
    quantity: Quantity
    notes: str | None = Field(default=None, max_length=500)


class MaterialUsagePublic(BaseModel):
    id: uuid.UUID
    order_id: uuid.UUID
    item_id: uuid.UUID
    item_name: str
    unit: str
    quantity: Decimal
    notes: str | None
    created_by_name: str
    created_at: datetime


class InventoryListResponse(BaseModel):
    items: list[InventoryItemPublic]
    total: int
