from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import httpx

from app.core.config import Settings


class EmailDeliveryError(Exception):
    """Raised when a provider cannot accept a transactional message."""


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


class ResendEmailProvider:
    endpoint = "https://api.resend.com/emails"

    def __init__(self, settings: Settings) -> None:
        self._api_key = settings.email_api_key
        self._from = f"{settings.email_from_name} <{settings.email_from_address}>"
        self._timeout = settings.email_timeout_seconds

    async def send(self, message: TransactionalEmail) -> None:
        if not self._api_key:
            raise EmailDeliveryError("Transactional email is not configured.")
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    self.endpoint,
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    json={
                        "from": self._from,
                        "to": [message.to],
                        "subject": message.subject,
                        "text": message.text,
                        "html": message.html,
                    },
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise EmailDeliveryError("Transactional email delivery failed.") from exc


capture_email_provider = CaptureEmailProvider()


def get_transactional_email_service(settings: Settings) -> TransactionalEmailProvider:
    if settings.email_provider == "capture":
        return capture_email_provider
    return ResendEmailProvider(settings)
