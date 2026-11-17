import pytest
from sqlalchemy import select

from app.models.user import User, UserRole


async def make_super_admin(client):
    from app.main import app

    session_factory = app.state.test_session_factory
    # Register regular owner
    await client.post(
        "/api/v1/auth/register",
        json={
            "user": {
                "first_name": "Super",
                "last_name": "Admin",
                "email": "superadmin@fashionos.ng",
                "password": "SuperSecretPass123!",
            },
            "business": {
                "name": "FashionOS Admin HQ",
                "phone": "+2348000000099",
            },
        },
    )
    # Promote user to SUPER_ADMIN in DB
    async with session_factory() as session:
        result = await session.execute(select(User).where(User.email == "superadmin@fashionos.ng"))
        user = result.scalar_one()
        user.role = UserRole.SUPER_ADMIN
        await session.commit()


@pytest.mark.asyncio
async def test_admin_routes_forbidden_for_regular_users(client):
    # Register non-admin user
    await client.post(
        "/api/v1/auth/register",
        json={
            "user": {
                "first_name": "Ada",
                "last_name": "Okafor",
                "email": "reguser@example.com",
                "password": "StrongPass123!",
            },
            "business": {"name": "Ada Bespoke", "phone": "+2348000000000"},
        },
    )
    # Attempting to access admin endpoints returns 403 Forbidden
    response = await client.get("/api/v1/admin/metrics")
    assert response.status_code == 403
    assert response.json()["detail"] == "Super Admin privilege required."


@pytest.mark.asyncio
async def test_admin_metrics_and_tenant_management(client):
    await make_super_admin(client)

    # Fetch platform metrics
    metrics_res = await client.get("/api/v1/admin/metrics")
    assert metrics_res.status_code == 200
    metrics_data = metrics_res.json()
    assert metrics_data["total_businesses"] >= 1
    assert metrics_data["active_businesses"] >= 1

    # List all businesses
    list_res = await client.get("/api/v1/admin/businesses")
    assert list_res.status_code == 200
    businesses_data = list_res.json()
    assert len(businesses_data["items"]) >= 1
    target_b_id = businesses_data["items"][0]["id"]

    # Update business feature entitlements
    update_ent = await client.patch(
        f"/api/v1/admin/businesses/{target_b_id}/entitlements",
        json={
            "enabled_features": ["customers", "orders", "measurements"],
            "max_staff_users": 15,
        },
    )
    assert update_ent.status_code == 200
    ent_data = update_ent.json()
    assert ent_data["max_staff_users"] == 15
    assert set(ent_data["enabled_features"]) == {"customers", "orders", "measurements"}

    # Toggle business active status (suspend)
    toggle_res = await client.post(f"/api/v1/admin/businesses/{target_b_id}/toggle-active")
    assert toggle_res.status_code == 200
    assert toggle_res.json()["is_active"] is False

    # Fetch platform activity
    act_res = await client.get("/api/v1/admin/activity")
    assert act_res.status_code == 200
    assert isinstance(act_res.json(), list)


@pytest.mark.asyncio
async def test_system_status_and_readonly_database_query(client):
    await make_super_admin(client)

    status_response = await client.get("/api/v1/admin/system/status")
    assert status_response.status_code == 200, status_response.text
    status_payload = status_response.json()
    assert status_payload["api_status"] == "HEALTHY"
    assert status_payload["database_status"] == "HEALTHY"
    assert status_payload["database_table_count"] > 0

    query_response = await client.post(
        "/api/v1/admin/system/database-query",
        json={"query": "SELECT COUNT(*) AS business_count FROM businesses"},
    )
    assert query_response.status_code == 200, query_response.text
    assert query_response.json()["rows"][0]["business_count"] == 1

    unsafe_response = await client.post(
        "/api/v1/admin/system/database-query",
        json={"query": "DELETE FROM businesses"},
    )
    assert unsafe_response.status_code == 422

    secret_table_response = await client.post(
        "/api/v1/admin/system/database-query",
        json={"query": "SELECT * FROM users"},
    )
    assert secret_table_response.status_code == 422
