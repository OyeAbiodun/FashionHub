from conftest import register_payload
from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import create_token
from app.main import settings as app_settings
from app.models.business import Business
from app.models.password_reset import PasswordResetToken
from app.models.user import User
from app.services.auth_service import request_password_reset


async def test_health_endpoint_succeeds(client):
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "reachable"}


async def test_registration_succeeds(client):
    response = await client.post("/api/v1/auth/register", json=register_payload())
    assert response.status_code == 201
    data = response.json()
    assert data["user"]["email"] == "owner@example.com"
    assert data["user"]["role"] == "OWNER"
    assert data["business"]["name"] == "Ada Bespoke"
    assert "fashionos_access_token" in response.cookies
    assert "fashionos_refresh_token" in response.cookies
    assert "password_hash" not in str(data)


async def test_api_security_headers_and_localhost_cors(client):
    response = await client.get("/api/v1/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"

    preflight = await client.options(
        "/api/v1/auth/register",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == "http://localhost:5173"


async def test_production_rejects_unsafe_requests_without_the_trusted_origin(client, monkeypatch):
    monkeypatch.setattr(app_settings, "app_env", "production")

    blocked = await client.post("/api/v1/auth/register", json=register_payload())
    assert blocked.status_code == 403
    assert blocked.json() == {"detail": "Origin not allowed"}

    allowed = await client.post(
        "/api/v1/auth/register",
        json=register_payload(),
        headers={"Origin": app_settings.frontend_origin},
    )
    assert allowed.status_code == 201


async def test_duplicate_registration_is_rejected(client):
    assert (await client.post("/api/v1/auth/register", json=register_payload())).status_code == 201
    response = await client.post("/api/v1/auth/register", json=register_payload())
    assert response.status_code == 409


async def test_registration_rejects_tenant_and_system_field_injection(client):
    payload = register_payload()
    payload["business"]["id"] = "00000000-0000-0000-0000-000000000001"
    payload["user"]["business_id"] = "00000000-0000-0000-0000-000000000002"
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422


async def test_password_is_not_stored_in_plain_text(client):
    await client.post("/api/v1/auth/register", json=register_payload())
    async with client._transport.app.state.test_session_factory() as session:
        result = await session.execute(select(User).where(User.email == "owner@example.com"))
        user = result.scalar_one()
        assert user.password_hash != "StrongPass123!"
        assert user.password_hash.startswith("$argon2")


async def test_login_succeeds(client):
    await client.post("/api/v1/auth/register", json=register_payload())
    response = await client.post(
        "/api/v1/auth/login", json={"email": "OWNER@EXAMPLE.COM", "password": "StrongPass123!"}
    )
    assert response.status_code == 200
    assert response.json()["business"]["name"] == "Ada Bespoke"


async def test_invalid_login_is_rejected(client):
    await client.post("/api/v1/auth/register", json=register_payload())
    response = await client.post(
        "/api/v1/auth/login", json={"email": "owner@example.com", "password": "bad-password"}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


async def test_me_rejects_unauthenticated_access(client):
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401


async def test_me_returns_current_user_and_business(client):
    await client.post("/api/v1/auth/register", json=register_payload())
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 200
    assert response.json()["user"]["email"] == "owner@example.com"


async def test_refresh_creates_usable_session(client):
    await client.post("/api/v1/auth/register", json=register_payload())
    client.cookies.pop("fashionos_access_token")
    response = await client.post("/api/v1/auth/refresh")
    assert response.status_code == 200
    assert "fashionos_access_token" in response.cookies
    assert (await client.get("/api/v1/auth/me")).status_code == 200


async def test_refresh_rejects_a_malformed_token_subject(client):
    token = create_token("not-a-uuid", get_settings(), token_kind="refresh")
    client.cookies.set("fashionos_refresh_token", token)
    response = await client.post("/api/v1/auth/refresh")
    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication required"


async def test_logout_clears_authentication_cookies(client):
    await client.post("/api/v1/auth/register", json=register_payload())
    response = await client.post("/api/v1/auth/logout")
    assert response.status_code == 200
    set_cookie_headers = response.headers.get_list("set-cookie")
    assert any("fashionos_access_token=" in header for header in set_cookie_headers)
    assert any("fashionos_refresh_token=" in header for header in set_cookie_headers)
    assert "fashionos_access_token" not in client.cookies
    assert "fashionos_refresh_token" not in client.cookies


async def test_registration_rolls_back_if_user_creation_fails(client, monkeypatch):
    from app.services import auth_service

    def broken_hash_password(_password: str) -> str:
        raise RuntimeError("hashing failed")

    monkeypatch.setattr(auth_service, "hash_password", broken_hash_password)
    response = await client.post(
        "/api/v1/auth/register", json=register_payload("rollback@example.com")
    )
    assert response.status_code == 500

    async with client._transport.app.state.test_session_factory() as session:
        businesses = (await session.execute(select(Business))).scalars().all()
        users = (await session.execute(select(User))).scalars().all()
        assert businesses == []
        assert users == []


async def test_forgot_and_reset_password_flow(client):
    await client.post("/api/v1/auth/register", json=register_payload("resetuser@example.com"))

    # HTTP responses never expose a reset credential, regardless of account existence.
    forgot_unknown = await client.post(
        "/api/v1/auth/forgot-password", json={"email": "unknown@example.com"}
    )
    assert forgot_unknown.status_code == 200
    assert "reset_token" not in forgot_unknown.json()

    forgot_resp = await client.post(
        "/api/v1/auth/forgot-password", json={"email": "RESETUSER@EXAMPLE.COM"}
    )
    assert forgot_resp.status_code == 200
    assert forgot_resp.json() == forgot_unknown.json()

    # Delivery adapters receive the raw token transiently; the HTTP API never exposes it.
    async with client._transport.app.state.test_session_factory() as session:
        _, reset_token = await request_password_reset(
            session, "resetuser@example.com", get_settings()
        )
    assert reset_token is not None

    # Reset password with invalid token fails
    invalid_reset = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": "invalid-token", "new_password": "NewSecretPass123!"},
    )
    assert invalid_reset.status_code == 400

    # Reset password with valid token succeeds
    valid_reset = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": reset_token, "new_password": "NewSecretPass123!"},
    )
    assert valid_reset.status_code == 200

    replay = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": reset_token, "new_password": "AnotherSecretPass123!"},
    )
    assert replay.status_code == 400

    # Login with old password fails
    old_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "resetuser@example.com", "password": "StrongPass123!"},
    )
    assert old_login.status_code == 401

    # Login with new password succeeds
    new_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "resetuser@example.com", "password": "NewSecretPass123!"},
    )
    assert new_login.status_code == 200


async def test_expired_password_reset_token_is_rejected(client):
    await client.post("/api/v1/auth/register", json=register_payload("expiredreset@example.com"))
    async with client._transport.app.state.test_session_factory() as session:
        _, raw_token = await request_password_reset(
            session, "expiredreset@example.com", get_settings()
        )
        reset_record = (await session.execute(select(PasswordResetToken))).scalar_one()
        from datetime import UTC, datetime, timedelta

        reset_record.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        await session.commit()

    response = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": raw_token, "new_password": "NewSecretPass123!"},
    )
    assert response.status_code == 400


async def test_update_user_profile_succeeds(client):
    await client.post("/api/v1/auth/register", json=register_payload("profileuser@example.com"))
    response = await client.patch(
        "/api/v1/auth/me",
        json={"first_name": "UpdatedAda", "last_name": "UpdatedObi", "phone": "+2348000000000"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["first_name"] == "UpdatedAda"
    assert data["user"]["last_name"] == "UpdatedObi"
    assert data["user"]["phone"] == "+2348000000000"


async def test_change_user_password_succeeds(client):
    await client.post("/api/v1/auth/register", json=register_payload("pwuser@example.com"))

    # Wrong current password fails
    wrong_pw = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "WrongPassword123!", "new_password": "BrandNewPass123!"},
    )
    assert wrong_pw.status_code == 400
    assert wrong_pw.json()["detail"] == "Incorrect current password."

    # Correct current password succeeds
    valid_pw = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "StrongPass123!", "new_password": "BrandNewPass123!"},
    )
    assert valid_pw.status_code == 200
    assert valid_pw.json()["message"] == "Password changed successfully."
