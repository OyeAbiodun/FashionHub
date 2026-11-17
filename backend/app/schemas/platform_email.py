from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.platform_email import PlatformEmailProvider, SmtpSecurityMode


class PlatformEmailConfigurationUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    provider: PlatformEmailProvider
    enabled: bool
    smtp_host: str = Field(min_length=1, max_length=255)
    smtp_port: int = Field(ge=1, le=65535)
    smtp_username: str | None = Field(default=None, max_length=320)
    smtp_password: str | None = Field(default=None, min_length=1, max_length=512)
    security_mode: SmtpSecurityMode
    from_email: EmailStr
    from_name: str = Field(min_length=1, max_length=200)
    support_email: EmailStr | None = None
    support_whatsapp: str | None = Field(default=None, max_length=32)

    @field_validator("smtp_host", "smtp_username", "from_name", "support_whatsapp")
    @classmethod
    def reject_header_newlines(cls, value: str | None) -> str | None:
        if value is not None and ("\r" in value or "\n" in value):
            raise ValueError("Value cannot contain line breaks")
        return value


class PlatformEmailConfigurationPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID | None = None
    provider: PlatformEmailProvider = PlatformEmailProvider.GMAIL
    enabled: bool = False
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password_configured: bool = False
    security_mode: SmtpSecurityMode = SmtpSecurityMode.STARTTLS
    from_email: str | None = None
    from_name: str = "FashionOS"
    support_email: str | None = None
    support_whatsapp: str | None = None
    configured: bool = False
    last_tested_at: datetime | None = None
    last_test_status: str | None = None


class PlatformEmailTestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recipient: EmailStr


class PlatformSupportContact(BaseModel):
    support_email: EmailStr | None = None
    support_whatsapp: str | None = None
