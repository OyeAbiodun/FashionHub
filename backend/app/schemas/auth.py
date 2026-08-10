from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.business import BusinessCreate, BusinessPublic
from app.schemas.user import UserPublic, UserRegister


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user: UserRegister
    business: BusinessCreate


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class AuthSession(BaseModel):
    user: UserPublic
    business: BusinessPublic


class MessageResponse(BaseModel):
    message: str
