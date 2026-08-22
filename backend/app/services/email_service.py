from __future__ import annotations

import asyncio
import smtplib
import ssl
from dataclasses import dataclass
from datetime import UTC, datetime
from email.message import EmailMessage
from email.utils import formataddr
from typing import Protocol

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.email_secrets import (
    PlatformEmailSecretError,
    decrypt_platform_email_secret,
    encrypt_platform_email_secret,
)
from app.models.platform_email import (
    PlatformEmailConfiguration,
    PlatformEmailProvider,
    SmtpSecurityMode,
)
from app.schemas.platform_email import (
    PlatformEmailConfigurationPublic,
    PlatformEmailConfigurationUpdate,
)

PROVIDER_PRESETS = {
    PlatformEmailProvider.GMAIL: ("smtp.gmail.com", 587, SmtpSecurityMode.STARTTLS),
    PlatformEmailProvider.OUTLOOK: ("smtp.office365.com", 587, SmtpSecurityMode.STARTTLS),
    PlatformEmailProvider.YAHOO: ("smtp.mail.yahoo.com", 465, SmtpSecurityMode.TLS),
}


class EmailDeliveryError(Exception):
    """Raised when transactional email cannot be safely delivered."""


@dataclass(frozen=True)
class TransactionalEmail:
    to: str
    subject: str
    text: str
    html: str


class TransactionalEmailProvider(Protocol):
    async def send(self, message: TransactionalEmail) -> None: ...


class CaptureEmailProvider:
    """Development/test provider that records messages without network delivery."""

    def __init__(self) -> None:
        self.messages: list[TransactionalEmail] = []

    async def send(self, message: TransactionalEmail) -> None:
        self.messages.append(message)

    def clear(self) -> None:
        self.messages.clear()


class SmtpEmailProvider:
    def __init__(
        self, configuration: PlatformEmailConfiguration, password: str, settings: Settings
    ) -> None:
        self._configuration = configuration
        self._password = password
        self._timeout = settings.smtp_timeout_seconds

    async def send(self, message: TransactionalEmail) -> None:
        try:
            await asyncio.to_thread(self._send_sync, message)
        except (OSError, smtplib.SMTPException, ValueError) as exc:
            raise EmailDeliveryError("Transactional email delivery failed.") from exc

    def _send_sync(self, message: TransactionalEmail) -> None:
        configuration = self._configuration
        email = EmailMessage()
        email["From"] = formataddr((configuration.from_name, configuration.from_email))
        email["To"] = message.to
        email["Subject"] = message.subject
        email.set_content(message.text)
        email.add_alternative(message.html, subtype="html")
        context = ssl.create_default_context()

        if configuration.security_mode == SmtpSecurityMode.TLS:
            with smtplib.SMTP_SSL(
                configuration.smtp_host,
                configuration.smtp_port,
                timeout=self._timeout,
                context=context,
            ) as client:
                self._authenticate_and_send(client, email)
            return

        with smtplib.SMTP(
            configuration.smtp_host, configuration.smtp_port, timeout=self._timeout
        ) as client:
            if configuration.security_mode == SmtpSecurityMode.STARTTLS:
                client.starttls(context=context)
            self._authenticate_and_send(client, email)

    def _authenticate_and_send(self, client: smtplib.SMTP, email: EmailMessage) -> None:
        username = self._configuration.smtp_username
        if not username:
            raise ValueError("SMTP username is required")
        client.login(username, self._password)
        client.send_message(email)


capture_email_provider = CaptureEmailProvider()


async def get_platform_email_configuration(
    session: AsyncSession,
) -> PlatformEmailConfiguration | None:
    return (
        await session.execute(
            select(PlatformEmailConfiguration).where(
                PlatformEmailConfiguration.config_key == "platform"
            )
        )
    ).scalar_one_or_none()


def serialize_platform_email_configuration(
    configuration: PlatformEmailConfiguration | None,
) -> PlatformEmailConfigurationPublic:
    if configuration is None:
        return PlatformEmailConfigurationPublic()
    secret_configured = bool(configuration.smtp_password_encrypted)
    return PlatformEmailConfigurationPublic(
        id=configuration.id,
        provider=configuration.provider,
        enabled=configuration.enabled,
        smtp_host=configuration.smtp_host,
        smtp_port=configuration.smtp_port,
        smtp_username=configuration.smtp_username,
        smtp_password_configured=secret_configured,
        security_mode=configuration.security_mode,
        from_email=configuration.from_email,
        from_name=configuration.from_name,
        configured=bool(
            configuration.enabled
            and configuration.smtp_host
            and configuration.smtp_username
            and secret_configured
            and configuration.from_email
        ),
        last_tested_at=configuration.last_tested_at,
        last_test_status=configuration.last_test_status,
    )


async def update_platform_email_configuration(
    session: AsyncSession,
    payload: PlatformEmailConfigurationUpdate,
    settings: Settings,
) -> PlatformEmailConfigurationPublic:
    configuration = await get_platform_email_configuration(session)
    existing_secret = configuration.smtp_password_encrypted if configuration else None
    if payload.enabled and not payload.smtp_username:
        raise _invalid_configuration("SMTP username/email is required when email is enabled.")
    if payload.enabled and not (payload.smtp_password or existing_secret):
        raise _invalid_configuration(
            "An SMTP password or app password is required when email is enabled."
        )

    encrypted_secret = existing_secret
    if payload.smtp_password is not None:
        try:
            encrypted_secret = encrypt_platform_email_secret(payload.smtp_password, settings)
        except PlatformEmailSecretError as exc:
            raise _configuration_unavailable() from exc

    if configuration is None:
        configuration = PlatformEmailConfiguration(
            config_key="platform",
            provider=payload.provider,
            enabled=payload.enabled,
            smtp_host=payload.smtp_host,
            smtp_port=payload.smtp_port,
            smtp_username=payload.smtp_username,
            smtp_password_encrypted=encrypted_secret,
            security_mode=payload.security_mode,
            from_email=str(payload.from_email),
            from_name=payload.from_name,
        )
        session.add(configuration)
    else:
        configuration.provider = payload.provider
        configuration.enabled = payload.enabled
        configuration.smtp_host = payload.smtp_host
        configuration.smtp_port = payload.smtp_port
        configuration.smtp_username = payload.smtp_username
        configuration.smtp_password_encrypted = encrypted_secret
        configuration.security_mode = payload.security_mode
        configuration.from_email = str(payload.from_email)
        configuration.from_name = payload.from_name
    await session.commit()
    await session.refresh(configuration)
    return serialize_platform_email_configuration(configuration)


async def get_configured_email_provider(
    session: AsyncSession, settings: Settings
) -> TransactionalEmailProvider | None:
    configuration = await get_platform_email_configuration(session)
    public_configuration = serialize_platform_email_configuration(configuration)
    if configuration is None or not public_configuration.configured:
        return None
    if settings.app_env.lower() != "production":
        return capture_email_provider
    try:
        password = decrypt_platform_email_secret(
            configuration.smtp_password_encrypted or "", settings
        )
    except PlatformEmailSecretError as exc:
        raise EmailDeliveryError("Platform email configuration is unavailable.") from exc
    return SmtpEmailProvider(configuration, password, settings)


async def send_test_email(
    session: AsyncSession, recipient: str, settings: Settings
) -> bool:
    configuration = await get_platform_email_configuration(session)
    provider = await get_configured_email_provider(session, settings)
    if configuration is None or provider is None:
        raise _invalid_configuration("Email delivery is not configured and enabled.")
    message = TransactionalEmail(
        to=recipient,
        subject="FashionOS Email Configuration Test",
        text="This is a FashionOS platform email configuration test.",
        html=(
            "<p>This is a <strong>FashionOS</strong> platform email configuration test.</p>"
        ),
    )
    try:
        await provider.send(message)
    except EmailDeliveryError:
        configuration.last_tested_at = datetime.now(UTC)
        configuration.last_test_status = "FAILED"
        await session.commit()
        return False
    configuration.last_tested_at = datetime.now(UTC)
    configuration.last_test_status = "SUCCESS"
    await session.commit()
    return True


def provider_preset(provider: PlatformEmailProvider) -> tuple[str, int, SmtpSecurityMode] | None:
    return PROVIDER_PRESETS.get(provider)


def _invalid_configuration(message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=message)


def _configuration_unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Platform email encryption is not available.",
    )
