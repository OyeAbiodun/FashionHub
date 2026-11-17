import re
from urllib.parse import unquote
from uuid import UUID

from conftest import register_payload
from sqlalchemy import select

from app.models.business import Business
from app.services.email_service import capture_email_provider


async def register_owner(client, email: str) -> dict[str, str]:
    response = await client.post("/api/v1/auth/register", json=register_payload(email))
    assert response.status_code == 201
    return dict(client.cookies)


def use_cookies(client, cookies: dict[str, str]) -> None:
    client.cookies.clear()
    for name, value in cookies.items():
        client.cookies.set(name, value)


async def add_staff(client, *, email: str, permissions: list[str] | None = None) -> dict:
    owner_cookies = dict(client.cookies)
    response = await client.post(
        "/api/v1/team",
        json={
            "first_name": "Studio",
            "last_name": "Staff",
            "email": email,
            "role": "STAFF",
            "permissions": permissions,
        },
    )
    assert response.status_code == 201
    message = next(item for item in capture_email_provider.messages if item.to == email)
    match = re.search(r"token=([^\s&]+)", message.text)
    assert match
    accepted = await client.post(
        "/api/v1/team/invitations/accept",
        json={"token": unquote(match.group(1)), "password": "StaffPass123!"},
    )
    assert accepted.status_code == 200, accepted.text
    client.cookies.clear()
    for name, value in owner_cookies.items():
        client.cookies.set(name, value)
    return accepted.json()["user"]


async def test_staff_cannot_manage_team_roles_or_escalate_privileges(client):
    owner_cookies = await register_owner(client, "securityowner@example.com")
    await add_staff(client, email="securitystaff@example.com", permissions=["tasks:read"])

    client.cookies.clear()
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "securitystaff@example.com", "password": "StaffPass123!"},
    )
    assert login.status_code == 200

    create_super_admin = await client.post(
        "/api/v1/team",
        json={
            "first_name": "Bad",
            "last_name": "Actor",
            "email": "badactor@example.com",
            "role": "SUPER_ADMIN",
        },
    )
    assert create_super_admin.status_code == 403
    assert (await client.post("/api/v1/roles", json={"name": "Escalation"})).status_code == 403
    assert (await client.post("/api/v1/tasks", json={})).status_code == 403

    use_cookies(client, owner_cookies)
    owner_attempt = await client.post(
        "/api/v1/team",
        json={
            "first_name": "Also",
            "last_name": "Blocked",
            "email": "also-blocked@example.com",
            "role": "SUPER_ADMIN",
        },
    )
    assert owner_attempt.status_code == 403


async def test_custom_role_permissions_are_effective_at_the_api_layer(client):
    await register_owner(client, "rolepermissionowner@example.com")
    role_response = await client.post(
        "/api/v1/roles",
        json={"name": "Task Viewer", "permissions": ["tasks:read"]},
    )
    assert role_response.status_code == 201
    await add_staff(
        client,
        email="rolepermissionstaff@example.com",
        permissions=[],
    )
    staff_response = await client.get("/api/v1/team")
    staff_id = next(
        item["id"]
        for item in staff_response.json()
        if item["email"] == "rolepermissionstaff@example.com"
    )
    assigned = await client.patch(
        f"/api/v1/team/{staff_id}",
        json={"custom_role_id": role_response.json()["id"]},
    )
    assert assigned.status_code == 200

    client.cookies.clear()
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "rolepermissionstaff@example.com", "password": "StaffPass123!"},
    )
    assert login.status_code == 200
    assert (await client.get("/api/v1/tasks")).status_code == 200
    assert (await client.get("/api/v1/customers")).status_code == 403


async def test_disabled_business_blocks_login_refresh_and_protected_access(client):
    cookies = await register_owner(client, "suspended@example.com")
    async with client._transport.app.state.test_session_factory() as session:
        business = (await session.execute(select(Business))).scalar_one()
        business.is_active = False
        await session.commit()

    client.cookies.clear()
    denied_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "suspended@example.com", "password": "StrongPass123!"},
    )
    assert denied_login.status_code == 401
    use_cookies(client, cookies)
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401
    assert (await client.get("/api/v1/customers")).status_code == 401

    async with client._transport.app.state.test_session_factory() as session:
        business = (await session.execute(select(Business))).scalar_one()
        business.is_active = True
        await session.commit()
    client.cookies.clear()
    assert (
        await client.post(
            "/api/v1/auth/login",
            json={"email": "suspended@example.com", "password": "StrongPass123!"},
        )
    ).status_code == 200


async def test_disabled_feature_and_cross_tenant_task_relationship_are_denied(client):
    first_cookies = await register_owner(client, "tenantone@example.com")
    customer = (
        await client.post("/api/v1/customers", json={"first_name": "First", "phone": "08010000001"})
    ).json()
    order = (
        await client.post(
            "/api/v1/orders",
            json={
                "customer_id": customer["id"],
                "order_date": "2026-08-20",
                "due_date": "2026-08-21",
                "reference_image": "data:image/png;base64,AA==",
                "items": [{"garment_type": "Agbada", "unit_price": "1.00"}],
            },
        )
    ).json()

    second_registration = await client.post(
        "/api/v1/auth/register", json=register_payload("tenanttwo@example.com")
    )
    assert second_registration.status_code == 201
    second_business_id = second_registration.json()["business"]["id"]
    team = (await client.get("/api/v1/team")).json()
    other_owner_id = team[0]["id"]
    cross_tenant_task = await client.post(
        "/api/v1/tasks",
        json={"title": "Invalid link", "assigned_to_id": other_owner_id, "order_id": order["id"]},
    )
    assert cross_tenant_task.status_code == 404

    async with client._transport.app.state.test_session_factory() as session:
        business = await session.get(Business, UUID(second_business_id))
        assert business is not None
        business.enabled_features = [
            feature for feature in business.enabled_features if feature != "customers"
        ]
        await session.commit()
    assert (await client.get("/api/v1/customers")).status_code == 403

    use_cookies(client, first_cookies)
    assert (await client.get("/api/v1/customers")).status_code == 200
