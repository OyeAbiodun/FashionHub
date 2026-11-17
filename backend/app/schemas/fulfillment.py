from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.fulfillment import FulfillmentEventType, FulfillmentMethod, FulfillmentStatus
from app.schemas.customer import blank_to_none


class FulfillmentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: FulfillmentMethod
    recipient_name: str | None = Field(default=None, max_length=200)
    recipient_phone: str | None = Field(default=None, max_length=40)
    delivery_address: str | None = Field(default=None, max_length=2000)
    delivery_instructions: str | None = Field(default=None, max_length=2000)
    tracking_reference: str | None = Field(default=None, max_length=255)
    delivery_charge: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)

    @field_validator(
        "recipient_name",
        "recipient_phone",
        "delivery_address",
        "delivery_instructions",
        "tracking_reference",
        mode="before",
    )
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return blank_to_none(value)

    @model_validator(mode="after")
    def delivery_requires_address(self) -> "FulfillmentUpdate":
        if self.method == FulfillmentMethod.DELIVERY and not self.delivery_address:
            raise ValueError("A delivery address is required for delivery fulfillment.")
        if (
            self.method == FulfillmentMethod.PICKUP
            and self.delivery_charge is not None
            and self.delivery_charge > 0
        ):
            raise ValueError("Pickup orders cannot have a delivery charge.")
        return self


class FulfillmentAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notes: str | None = Field(default=None, max_length=2000)
    proof_of_delivery_url: str | None = Field(default=None, max_length=1_500_000)

    @field_validator("notes", mode="before")
    @classmethod
    def normalize_notes(cls, value: str | None) -> str | None:
        return blank_to_none(value)

    @field_validator("proof_of_delivery_url", mode="before")
    @classmethod
    def normalize_proof(cls, value: str | None) -> str | None:
        return blank_to_none(value)

    @field_validator("proof_of_delivery_url")
    @classmethod
    def validate_proof_image(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith(("data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,")):
            raise ValueError("Proof must be a JPEG, PNG, or WebP image capture.")
        return value


class FulfillmentEventResponse(BaseModel):
    id: UUID
    event_type: FulfillmentEventType
    actor_id: UUID
    actor_name: str
    notes: str | None
    occurred_at: datetime


class FulfillmentResponse(BaseModel):
    id: UUID
    method: FulfillmentMethod
    status: FulfillmentStatus
    recipient_name: str | None
    recipient_phone: str | None
    delivery_address: str | None
    delivery_instructions: str | None
    tracking_reference: str | None
    proof_of_delivery_url: str | None
    dispatched_at: datetime | None
    completed_at: datetime | None
    events: list[FulfillmentEventResponse]
