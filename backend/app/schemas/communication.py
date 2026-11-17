import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.communication import CommunicationChannel, CommunicationStatus


class MessageTemplateWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=160)
    channel: CommunicationChannel
    subject: str | None = Field(default=None, max_length=200)
    body: str = Field(min_length=1, max_length=8000)
    is_active: bool = True


class MessageTemplatePublic(MessageTemplateWrite):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    id: uuid.UUID
    created_at: datetime


class CommunicationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    customer_id: uuid.UUID
    order_id: uuid.UUID | None = None
    template_id: uuid.UUID | None = None
    channel: CommunicationChannel | None = None
    subject: str | None = Field(default=None, max_length=200)
    body: str | None = Field(default=None, max_length=8000)


class CommunicationAttemptPublic(BaseModel):
    id: uuid.UUID
    status: CommunicationStatus
    note: str | None
    created_by_name: str
    created_at: datetime


class CommunicationPublic(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    customer_name: str
    order_id: uuid.UUID | None
    order_number: str | None
    channel: CommunicationChannel
    status: CommunicationStatus
    recipient: str
    subject: str | None
    body: str
    handoff_url: str
    created_by_name: str
    created_at: datetime
    attempts: list[CommunicationAttemptPublic]


class CommunicationOutcome(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: CommunicationStatus
    note: str | None = Field(default=None, max_length=500)

    @field_validator("status")
    @classmethod
    def validate_status(cls, value):
        if value == CommunicationStatus.PREPARED:
            raise ValueError("Outcome must be sent or failed")
        return value


class ReminderCandidate(BaseModel):
    customer_id: uuid.UUID
    customer_name: str
    phone: str
    email: EmailStr | None
    order_id: uuid.UUID
    order_number: str
    due_date: date
    outstanding_balance: Decimal
    days_until_due: int
    reminder_reason: str


class ReminderCandidateList(BaseModel):
    items: list[ReminderCandidate]
