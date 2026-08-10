from conftest import register_payload


async def register_owner(client, email: str = "owner@example.com") -> tuple[dict, dict]:
    response = await client.post("/api/v1/auth/register", json=register_payload(email))
    assert response.status_code == 201
    return response.json(), dict(client.cookies)


def use_cookies(client, cookies: dict[str, str]) -> None:
    client.cookies.clear()
    for name, value in cookies.items():
        client.cookies.set(name, value)


async def test_business_settings_requires_authentication(client):
    assert (await client.get("/api/v1/business")).status_code == 401
    assert (await client.patch("/api/v1/business", json={"name": "Nope"})).status_code == 401


async def test_current_business_settings_can_be_fetched(client):
    session, _cookies = await register_owner(client)
    response = await client.get("/api/v1/business")
    assert response.status_code == 200
    assert response.json()["id"] == session["business"]["id"]
    assert response.json()["currency"] == "NGN"
    assert response.json()["timezone"] == "Africa/Lagos"


async def test_business_profile_and_invoice_preferences_can_be_updated(client):
    await register_owner(client)
    response = await client.patch(
        "/api/v1/business",
        json={
            "name": "Atelier Meridian",
            "phone": "+2348099999999",
            "email": "hello@atelier.example.com",
            "address": "12 Broad Street, Lagos",
            "logo_url": "https://cdn.example.com/logo.png",
            "invoice_notes": "Thank you for choosing Atelier Meridian.",
            "invoice_footer": "Goods remain our property until fully paid.",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Atelier Meridian"
    assert data["phone"] == "+2348099999999"
    assert data["email"] == "hello@atelier.example.com"
    assert data["address"] == "12 Broad Street, Lagos"
    assert data["logo_url"] == "https://cdn.example.com/logo.png"
    assert data["invoice_notes"].startswith("Thank you")
    assert data["invoice_footer"].startswith("Goods remain")


async def test_invalid_email_and_logo_url_are_rejected(client):
    await register_owner(client)
    assert (
        await client.patch("/api/v1/business", json={"email": "not-an-email"})
    ).status_code == 422
    assert (
        await client.patch("/api/v1/business", json={"logo_url": "javascript:alert(1)"})
    ).status_code == 422


async def test_supported_currency_can_be_updated_and_unsupported_is_rejected(client):
    await register_owner(client)
    accepted = await client.patch("/api/v1/business", json={"currency": "gbp"})
    assert accepted.status_code == 200
    assert accepted.json()["currency"] == "GBP"
    assert (await client.patch("/api/v1/business", json={"currency": "BTC"})).status_code == 422


async def test_valid_timezone_is_accepted_and_invalid_timezone_is_rejected(client):
    await register_owner(client)
    accepted = await client.patch("/api/v1/business", json={"timezone": "America/New_York"})
    assert accepted.status_code == 200
    assert accepted.json()["timezone"] == "America/New_York"
    assert (
        await client.patch("/api/v1/business", json={"timezone": "Mars/Lagos"})
    ).status_code == 422


async def test_business_id_and_system_fields_cannot_be_injected(client):
    session, _cookies = await register_owner(client)
    response = await client.patch(
        "/api/v1/business",
        json={
            "business_id": "00000000-0000-0000-0000-000000000001",
            "id": session["business"]["id"],
            "created_at": "2026-01-01T00:00:00Z",
        },
    )
    assert response.status_code == 422


async def test_business_settings_are_isolated_between_tenants(client):
    first_session, first_cookies = await register_owner(client, "one@example.com")
    await register_owner(client, "two@example.com")
    await client.patch("/api/v1/business", json={"name": "Second Atelier"})
    assert (await client.get("/api/v1/business")).json()["name"] == "Second Atelier"

    use_cookies(client, first_cookies)
    first = await client.get("/api/v1/business")
    assert first.json()["id"] == first_session["business"]["id"]
    assert first.json()["name"] == "Ada Bespoke"


async def test_auth_me_reflects_updated_business_settings(client):
    await register_owner(client)
    await client.patch(
        "/api/v1/business",
        json={"name": "Updated Atelier", "currency": "USD", "timezone": "Europe/London"},
    )
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 200
    assert response.json()["business"]["name"] == "Updated Atelier"
    assert response.json()["business"]["currency"] == "USD"
    assert response.json()["business"]["timezone"] == "Europe/London"
