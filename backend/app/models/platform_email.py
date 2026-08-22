from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, Enum, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class PlatformEmailProvider(StrEnum):
    GMAIL = "GMAIL"
    OUTLOOK = "OUTLOOK"
    YAHOO = "YAHOO"
    CUSTOM_SMTP = "CUSTOM_SMTP"


class SmtpSecurityMode(StrEnum):
    STARTTLS = "STARTTLS"
    TLS = "TLS"
    NONE = "NONE"


class PlatformEmailConfiguration(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "platform_email_configurations"

    config_key: Mapped[str] = mapped_column(
        String(32), nullable=False, unique=True, default="platform"
    )
    provider: Mapped[PlatformEmailProvider] = mapped_column(
        Enum(PlatformEmailProvider, name="platform_email_provider"), nullable=False
    )
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    smtp_host: Mapped[str] = mapped_column(String(255), nullable=False)
    smtp_port: Mapped[int] = mapped_column(Integer, nullable=False)
    smtp_username: Mapped[str | None] = mapped_column(String(320), nullable=True)
    smtp_password_encrypted: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    security_mode: Mapped[SmtpSecurityMode] = mapped_column(
        Enum(SmtpSecurityMode, name="smtp_security_mode"), nullable=False
    )
    from_email: Mapped[str] = mapped_column(String(320), nullable=False)
    from_name: Mapped[str] = mapped_column(String(200), nullable=False, default="FashionOS")
    last_tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_test_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
