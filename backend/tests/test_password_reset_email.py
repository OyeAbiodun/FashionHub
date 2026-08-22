from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

from conftest import register_payload
from sqlalchemy import select

from app.models.business import Business
from app.models.password_reset import PasswordResetToken
from app.models.platform_email import PlatformEmailConfiguration
from app.services import auth_service
from app.services.email_service import (
    EmailDeliveryError,
    TransactionalEmail,
    capture_email_provider,
)


def token_from_message(message: TransactionalEmail) -> str:
    url = next(line for line in message.text.splitlines() if "/reset-password?" in line)
    return parse_qs(urlparse(url).query)["token"][0]


async def test_reset_email_uses_platform_branding_and_only_stores_token_hash(client):
    await client.post("/api/v1/auth/register", json=register_payload("brandedreset@example.com"))

    response = await client.post(
        "/api/v1/auth/forgot-password", json={"email": "brandedreset@example.com"}
    )
    assert response.status_code == 200
    assert "token" not in response.text
    assert len(capture_email_provider.messages) == 1
    message = capture_email_provider.messages[0]
    raw_token = token_from_message(message)
    assert message.to == "brandedreset@example.com"
    assert message.subject == "FashionOS Password Reset"
    assert "http://127.0.0.1:5173/reset-password?token=" in message.text
    assert raw_token in message.text and raw_token in message.html
    assert "FashionOS Password Reset" in message.html
    assert "Hello Ada" in message.html
    assert "Ada Bespoke" not in message.html

    async with client._transport.app.state.test_session_factory() as session:
        reset_token = (await session.execute(select(PasswordResetToken))).scalar_one()
        assert reset_token.token_hash != raw_token
        assert reset_token.token_hash == auth_service._hash_reset_token(raw_token)
        expires_at = reset_token.expires_at.replace(tzinfo=UTC)
        assert expires_at > datetime.now(UTC) + timedelta(minutes=14)
        assert expires_at <= datetime.now(UTC) + timedelta(minutes=15, seconds=2)


async def test_unknown_and_disabled_business_requests_are_generic_and_not_delivered(client):
    registration = await client.post(
        "/api/v1/auth/register", json=register_payload("disabledreset@example.com")
    )
    assert registration.status_code == 201
    unknown = await client.post(
        "/api/v1/auth/forgot-password", json={"email": "unknown@example.com"}
    )
    async with client._transport.app.state.test_session_factory() as session:
        business = (await session.execute(select(Business))).scalar_one()
        business.is_active = False
        await session.commit()
    disabled = await client.post(
        "/api/v1/auth/forgot-password", json={"email": "disabledreset@example.com"}
    )
    assert unknown.status_code == disabled.status_code == 200
    assert unknown.json() == disabled.json()
    assert capture_email_provider.messages == []
    async with client._transport.app.state.test_session_factory() as session:
        assert (await session.execute(select(PasswordResetToken))).scalars().all() == []


async def test_disabled_business_cannot_use_an_existing_reset_token(client):
    await client.post("/api/v1/auth/register", json=register_payload("disableduse@example.com"))
    await client.post("/api/v1/auth/forgot-password", json={"email": "disableduse@example.com"})
    raw_token = token_from_message(capture_email_provider.messages[0])

    async with client._transport.app.state.test_session_factory() as session:
        business = (await session.execute(select(Business))).scalar_one()
        business.is_active = False
        await session.commit()

    response = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": raw_token, "new_password": "NewSecretPass123!"},
    )
    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid or expired password reset token."}


async def test_email_provider_failure_stays_generic_and_invalidates_undelivered_token(
    client, monkeypatch
):
    await client.post("/api/v1/auth/register", json=register_payload("providerfail@example.com"))

    class FailingProvider:
        async def send(self, message: TransactionalEmail) -> None:
            raise EmailDeliveryError("provider unavailable")

    async def get_failing_provider(_session, _settings):
        return FailingProvider()

    monkeypatch.setattr(
        auth_service,
        "get_configured_email_provider",
        get_failing_provider,
    )
    response = await client.post(
        "/api/v1/auth/forgot-password", json={"email": "providerfail@example.com"}
    )
    assert response.status_code == 200
    assert "provider" not in response.text.lower()
    assert capture_email_provider.messages == []
    async with client._transport.app.state.test_session_factory() as session:
        assert (await session.execute(select(PasswordResetToken))).scalars().all() == []


async def test_password_reset_without_platform_email_stays_generic_and_does_not_issue_token(client):
    await client.post("/api/v1/auth/register", json=register_payload("noconfig@example.com"))
    async with client._transport.app.state.test_session_factory() as session:
        configuration = (await session.execute(select(PlatformEmailConfiguration))).scalar_one()
        configuration.enabled = False
        await session.commit()

    response = await client.post(
        "/api/v1/auth/forgot-password", json={"email": "noconfig@example.com"}
    )
    assert response.status_code == 200
    assert "token" not in response.text
    assert capture_email_provider.messages == []
    async with client._transport.app.state.test_session_factory() as session:
        assert (await session.execute(select(PasswordResetToken))).scalars().all() == []


async def test_password_reset_requests_are_throttled_without_changing_response(client):
    await client.post("/api/v1/auth/register", json=register_payload("throttle@example.com"))
    responses = [
        await client.post("/api/v1/auth/forgot-password", json={"email": "throttle@example.com"})
        for _ in range(4)
    ]
    assert all(response.status_code == 200 for response in responses)
    assert len({response.text for response in responses}) == 1
    assert len(capture_email_provider.messages) == 3
