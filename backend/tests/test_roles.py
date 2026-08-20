import pytest


@pytest.mark.asyncio
async def test_custom_roles_flow(client):
    # Register business owner
    await client.post(
        "/api/v1/auth/register",
        json={
            "user": {
                "first_name": "Ada",
                "last_name": "Owner",
                "email": "roleowner@example.com",
                "password": "StrongPass123!",
            },
            "business": {"name": "Ada Role Studio", "phone": "+2348001112244"},
        },
    )

    # 1. Fetch default roles
    get_roles_res = await client.get("/api/v1/roles")
    assert get_roles_res.status_code == 200
    roles_list = get_roles_res.json()
    assert isinstance(roles_list, list)

    # 2. Create custom role
    create_res = await client.post(
        "/api/v1/roles",
        json={
            "name": "Master Pattern Cutter",
            "description": "Cuts garment patterns and manages fabric layouts",
            "permissions": ["customers:read", "measurements:write", "orders:write"],
        },
    )
    assert create_res.status_code == 201
    role_data = create_res.json()
    assert role_data["name"] == "Master Pattern Cutter"
    assert "measurements:write" in role_data["permissions"]

    role_id = role_data["id"]

    # 3. Update custom role
    update_res = await client.patch(
        f"/api/v1/roles/{role_id}",
        json={
            "description": "Updated cutter description",
            "permissions": ["customers:read", "measurements:write", "orders:write", "tasks:write"],
        },
    )
    assert update_res.status_code == 200
    assert update_res.json()["description"] == "Updated cutter description"
    assert "tasks:write" in update_res.json()["permissions"]

    # 4. Delete custom role
    del_res = await client.delete(f"/api/v1/roles/{role_id}")
    assert del_res.status_code == 204
