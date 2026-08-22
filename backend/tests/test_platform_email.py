import pytest
from sqlalchemy import select

from app.models.platform_email import PlatformEmailConfiguration
from app.models.user import User, UserRole
from app.services.email_service import PROVIDER_PRESETS, capture_email_provider


async def make_super_admin(client) -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "user": {
                "first_name": "Super",
                "last_name": "Admin",
                "email": "email-admin@fashionos.example.com",
                "password": "SuperSecretPass123!",
            },
            "business": {"name": "FashionOS Admin", "phone": "+2348000000099"},
        },
    )
    assert response.status_code == 201, response.text
    async with client._transport.app.state.test_session_factory() as session:
        user = (
            await session.execute(
                select(User).where(User.email == "email-admin@fashionos.example.com")
            )
        ).scalar_one()
        user.role = UserRole.SUPER_ADMIN
        await session.commit()


def email_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "provider": "GMAIL",
        "enabled": True,
        "smtp_host": "smtp.gmail.com",
        "smtp_port": 587,
        "smtp_username": "platform@fashionos.example.com",
        "smtp_password": "gmail-app-password",
        "security_mode": "STARTTLS",
        "from_email": "platform@fashionos.example.com",
        "from_name": "FashionOS",
    }
    payload.update(overrides)
    return payload


async def test_platform_email_is_super_admin_only(client):
    await client.post(
        "/api/v1/auth/register",
        json={
            "user": {
                "first_name": "Regular",
                "last_name": "User",
                "email": "regular-email-user@example.com",
                "password": "StrongPass123!",
            },
            "business": {"name": "Regular Studio", "phone": "+2348000000088"},
        },
    )
    for method, path, payload in [
        ("get", "/api/v1/platform/email", None),
        ("put", "/api/v1/platform/email", email_payload()),
        ("post", "/api/v1/platform/email/test", {"recipient": "test@example.com"}),
    ]:
        if method == "get":
            response = await client.get(path)
        else:
            response = await getattr(client, method)(path, json=payload)
        assert response.status_code == 403


async def test_super_admin_can_read_and_update_email_without_exposing_secret(client):
    await make_super_admin(client)
    before = await client.get("/api/v1/platform/email")
    assert before.status_code == 200
    assert "smtp_password" not in before.json()
    assert before.json()["smtp_password_configured"] is True

    update = await client.put("/api/v1/platform/email", json=email_payload())
    assert update.status_code == 200
    data = update.json()
    assert data["provider"] == "GMAIL"
    assert data["configured"] is True
    assert data["smtp_password_configured"] is True
    assert "gmail-app-password" not in update.text
    assert "smtp_password" not in data

    async with client._transport.app.state.test_session_factory() as session:
        stored = (await session.execute(select(PlatformEmailConfiguration))).scalar_one()
        encrypted_secret = stored.smtp_password_encrypted
        assert encrypted_secret is not None
        assert encrypted_secret != "gmail-app-password"

    without_secret = email_payload(smtp_password=None, from_name="FashionOS Support")
    preserved = await client.put("/api/v1/platform/email", json=without_secret)
    assert preserved.status_code == 200
    assert preserved.json()["smtp_password_configured"] is True
    async with client._transport.app.state.test_session_factory() as session:
        stored = (await session.execute(select(PlatformEmailConfiguration))).scalar_one()
        assert stored.smtp_password_encrypted == encrypted_secret


async def test_super_admin_can_send_a_safe_test_email_and_record_status(client):
    await make_super_admin(client)
    response = await client.post(
        "/api/v1/platform/email/test", json={"recipient": "recipient@example.com"}
    )
    assert response.status_code == 200
    assert response.json() == {"message": "Test email sent successfully."}
    message = capture_email_provider.messages[0]
    assert message.to == "recipient@example.com"
    assert message.subject == "FashionOS Email Configuration Test"
    assert "configuration test" in message.text
    async with client._transport.app.state.test_session_factory() as session:
        stored = (await session.execute(select(PlatformEmailConfiguration))).scalar_one()
        assert stored.last_test_status == "SUCCESS"
        assert stored.last_tested_at is not None


async def test_invalid_enabled_configuration_is_rejected_without_secret_disclosure(client):
    await make_super_admin(client)
    response = await client.put(
        "/api/v1/platform/email",
        json=email_payload(smtp_username=None, smtp_password=None),
    )
    assert response.status_code == 422
    assert "password" not in response.text.lower()


@pytest.mark.parametrize(
    ("provider", "host", "port", "security"),
    [
        ("GMAIL", "smtp.gmail.com", 587, "STARTTLS"),
        ("OUTLOOK", "smtp.office365.com", 587, "STARTTLS"),
        ("YAHOO", "smtp.mail.yahoo.com", 465, "TLS"),
    ],
)
async def test_platform_email_provider_presets(client, provider, host, port, security):
    await make_super_admin(client)
    response = await client.put(
        "/api/v1/platform/email",
        json=email_payload(
            provider=provider,
            smtp_host=host,
            smtp_port=port,
            security_mode=security,
        ),
    )
    assert response.status_code == 200
    assert response.json()["provider"] == provider
    preset = PROVIDER_PRESETS[response.json()["provider"]]
    assert (preset[0], preset[1], preset[2].value) == (host, port, security)


async def test_custom_smtp_configuration_is_supported(client):
    await make_super_admin(client)
    response = await client.put(
        "/api/v1/platform/email",
        json=email_payload(
            provider="CUSTOM_SMTP",
            smtp_host="mail.example.test",
            smtp_port=2525,
            security_mode="NONE",
        ),
    )
    assert response.status_code == 200
    assert response.json()["provider"] == "CUSTOM_SMTP"
    assert response.json()["smtp_host"] == "mail.example.test"
