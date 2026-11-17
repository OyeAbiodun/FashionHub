import re
from urllib.parse import unquote

import pytest
from sqlalchemy import select

from app.models.business import Business
from app.services.email_service import capture_email_provider


async def invite_and_accept(client, payload: dict) -> dict:
    owner_cookies = dict(client.cookies)
    invitation = await client.post("/api/v1/team", json=payload)
    assert invitation.status_code == 201, invitation.text
    message = next(item for item in capture_email_provider.messages if item.to == payload["email"])
    match = re.search(r"token=([^\s&]+)", message.text)
    assert match
    accepted = await client.post(
        "/api/v1/team/invitations/accept",
        json={"token": unquote(match.group(1)), "password": "StaffSecret123!"},
    )
    assert accepted.status_code == 200, accepted.text
    client.cookies.clear()
    for name, value in owner_cookies.items():
        client.cookies.set(name, value)
    return accepted.json()["user"]


@pytest.mark.asyncio
async def test_team_management_flow(client):
    # Register business owner
    await client.post(
        "/api/v1/auth/register",
        json={
            "user": {
                "first_name": "Ada",
                "last_name": "Owner",
                "email": "adaowner@example.com",
                "password": "StrongPass123!",
            },
            "business": {"name": "Ada Bespoke Studio", "phone": "+2348001112233"},
        },
    )

    # 1. Fetch team members (should contain 1 owner)
    get_team_res = await client.get("/api/v1/team")
    assert get_team_res.status_code == 200
    team_list = get_team_res.json()
    assert len(team_list) == 1
    assert team_list[0]["email"] == "adaowner@example.com"

    # 2. Add a new staff member (Tailor) with permissions
    staff_data = await invite_and_accept(
        client,
        {
            "first_name": "Emeka",
            "last_name": "Tailor",
            "email": "emeka@example.com",
            "role": "STAFF",
            "permissions": ["orders:read", "measurements:write"],
        },
    )
    assert staff_data["first_name"] == "Emeka"
    assert staff_data["role"] == "STAFF"
    assert "measurements:write" in staff_data["permissions"]

    staff_id = staff_data["id"]

    # 3. Update staff member (promote to BUSINESS_ADMIN and update permissions)
    update_res = await client.patch(
        f"/api/v1/team/{staff_id}",
        json={
            "role": "BUSINESS_ADMIN",
            "is_active": True,
        },
    )
    assert update_res.status_code == 200
    assert update_res.json()["role"] == "BUSINESS_ADMIN"


@pytest.mark.asyncio
async def test_staff_limit_enforcement(client):
    from app.main import app

    session_factory = app.state.test_session_factory
    await client.post(
        "/api/v1/auth/register",
        json={
            "user": {
                "first_name": "Small",
                "last_name": "Studio",
                "email": "smallstudio@example.com",
                "password": "StrongPass123!",
            },
            "business": {"name": "Small Studio", "phone": "+2348009998877"},
        },
    )

    # Lower max_staff_users to 1 in DB for testing
    async with session_factory() as session:
        b_res = await session.execute(select(Business).where(Business.name == "Small Studio"))
        b_obj = b_res.scalar_one()
        b_obj.max_staff_users = 1
        await session.commit()

    # Attempting to invite a second account when the owner uses the only slot fails.
    add_res = await client.post(
        "/api/v1/team",
        json={
            "first_name": "Extra",
            "last_name": "Staff",
            "email": "extrastaff@example.com",
            "role": "STAFF",
        },
    )
    assert add_res.status_code == 409
    assert "limit reached" in add_res.json()["detail"]
