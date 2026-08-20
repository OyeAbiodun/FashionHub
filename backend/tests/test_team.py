import pytest
from sqlalchemy import select

from app.models.business import Business


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
    add_staff_res = await client.post(
        "/api/v1/team",
        json={
            "first_name": "Emeka",
            "last_name": "Tailor",
            "email": "emeka@example.com",
            "password": "StaffSecret123!",
            "role": "STAFF",
            "permissions": ["orders:read", "measurements:write"],
        },
    )
    assert add_staff_res.status_code == 201
    staff_data = add_staff_res.json()
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
        b_res = await session.execute(
            select(Business).where(Business.name == "Small Studio")
        )
        b_obj = b_res.scalar_one()
        b_obj.max_staff_users = 1
        await session.commit()

    # Attempting to add 2nd staff member when limit is 1 fails with 400
    add_res = await client.post(
        "/api/v1/team",
        json={
            "first_name": "Extra",
            "last_name": "Staff",
            "email": "extrastaff@example.com",
            "password": "StaffSecret123!",
            "role": "STAFF",
        },
    )
    assert add_res.status_code == 400
    assert "limit reached" in add_res.json()["detail"]
