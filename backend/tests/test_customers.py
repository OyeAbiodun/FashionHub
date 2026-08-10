from conftest import register_payload
from sqlalchemy import select

from app.models.customer import Customer


def customer_payload(phone: str = "080 123-4567", first_name: str = "Bisi") -> dict:
    return {
        "first_name": first_name,
        "last_name": "Adeleke",
        "phone": phone,
        "alternate_phone": "",
        "email": f"{first_name.lower()}@example.com",
        "gender": "Female",
        "birthday": "1992-04-10",
        "address": "Yaba, Lagos",
        "notes": "Prefers evening fittings.",
    }


async def register_owner(client, email: str):
    response = await client.post("/api/v1/auth/register", json=register_payload(email))
    assert response.status_code == 201
    return dict(client.cookies)


def use_cookies(client, cookies: dict[str, str]) -> None:
    client.cookies.clear()
    for name, value in cookies.items():
        client.cookies.set(name, value)


async def create_customer(client, payload: dict | None = None) -> dict:
    response = await client.post("/api/v1/customers", json=payload or customer_payload())
    assert response.status_code == 201
    return response.json()


async def test_unauthenticated_customer_list_returns_401(client):
    response = await client.get("/api/v1/customers")
    assert response.status_code == 401


async def test_authenticated_owner_can_create_customer(client):
    await register_owner(client, "owner@example.com")
    response = await client.post("/api/v1/customers", json=customer_payload())
    assert response.status_code == 201
    assert response.json()["first_name"] == "Bisi"
    assert "business_id" not in response.json()


async def test_customer_rejects_system_fields_and_future_birthday(client):
    await register_owner(client, "owner@example.com")
    injected = customer_payload()
    injected["business_id"] = "00000000-0000-0000-0000-000000000001"
    assert (await client.post("/api/v1/customers", json=injected)).status_code == 422

    future = customer_payload(phone="08099999999")
    future["birthday"] = "2999-01-01"
    assert (await client.post("/api/v1/customers", json=future)).status_code == 422


async def test_required_fields_are_validated(client):
    await register_owner(client, "owner@example.com")
    response = await client.post("/api/v1/customers", json={"first_name": "", "phone": ""})
    assert response.status_code == 422


async def test_phone_is_normalized(client):
    await register_owner(client, "owner@example.com")
    await create_customer(client, customer_payload(phone="080 123-4567"))
    async with client._transport.app.state.test_session_factory() as session:
        result = await session.execute(select(Customer))
        customer = result.scalar_one()
        assert customer.phone == "080 123-4567"
        assert customer.phone_normalized == "0801234567"


async def test_duplicate_phone_in_same_business_returns_409(client):
    await register_owner(client, "owner@example.com")
    await create_customer(client, customer_payload(phone="080 123-4567"))
    response = await client.post("/api/v1/customers", json=customer_payload(phone="0801234567"))
    assert response.status_code == 409
    assert response.json()["detail"] == "A customer with this phone number already exists."


async def test_same_phone_can_exist_in_two_businesses(client):
    first_cookies = await register_owner(client, "owner-one@example.com")
    first = await create_customer(client, customer_payload(phone="080 123-4567"))
    second_cookies = await register_owner(client, "owner-two@example.com")
    second = await create_customer(client, customer_payload(phone="0801234567", first_name="Tola"))
    assert first["phone"] == "080 123-4567"
    assert second["phone"] == "0801234567"
    use_cookies(client, first_cookies)
    assert (await client.get(f"/api/v1/customers/{second['id']}")).status_code == 404
    use_cookies(client, second_cookies)
    assert (await client.get(f"/api/v1/customers/{first['id']}")).status_code == 404


async def test_user_sees_only_their_business_customers(client):
    first_cookies = await register_owner(client, "owner-one@example.com")
    await create_customer(client, customer_payload(first_name="Bisi"))
    await register_owner(client, "owner-two@example.com")
    await create_customer(client, customer_payload(phone="0810000000", first_name="Tola"))

    use_cookies(client, first_cookies)
    response = await client.get("/api/v1/customers")
    assert response.status_code == 200
    assert [item["first_name"] for item in response.json()["items"]] == ["Bisi"]


async def test_user_cannot_fetch_another_tenant_customer_by_uuid(client):
    first_cookies = await register_owner(client, "owner-one@example.com")
    first_customer = await create_customer(client)
    await register_owner(client, "owner-two@example.com")

    response = await client.get(f"/api/v1/customers/{first_customer['id']}")
    assert response.status_code == 404
    use_cookies(client, first_cookies)
    assert (await client.get(f"/api/v1/customers/{first_customer['id']}")).status_code == 200


async def test_user_cannot_update_another_tenant_customer(client):
    await register_owner(client, "owner-one@example.com")
    first_customer = await create_customer(client)
    await register_owner(client, "owner-two@example.com")

    response = await client.patch(
        f"/api/v1/customers/{first_customer['id']}", json={"first_name": "Changed"}
    )
    assert response.status_code == 404


async def test_user_cannot_archive_another_tenant_customer(client):
    await register_owner(client, "owner-one@example.com")
    first_customer = await create_customer(client)
    await register_owner(client, "owner-two@example.com")

    response = await client.post(f"/api/v1/customers/{first_customer['id']}/archive")
    assert response.status_code == 404


async def test_customer_search_works_by_first_name(client):
    await register_owner(client, "owner@example.com")
    await create_customer(client, customer_payload(first_name="Bisi"))
    await create_customer(client, customer_payload(phone="0810000000", first_name="Tola"))
    response = await client.get("/api/v1/customers", params={"search": "bis"})
    assert response.status_code == 200
    assert [item["first_name"] for item in response.json()["items"]] == ["Bisi"]


async def test_customer_search_works_by_phone(client):
    await register_owner(client, "owner@example.com")
    await create_customer(client, customer_payload(phone="080 123-4567", first_name="Bisi"))
    await create_customer(client, customer_payload(phone="0810000000", first_name="Tola"))
    response = await client.get("/api/v1/customers", params={"search": "080123"})
    assert response.status_code == 200
    assert [item["first_name"] for item in response.json()["items"]] == ["Bisi"]


async def test_pagination_metadata_is_correct(client):
    await register_owner(client, "owner@example.com")
    for index in range(3):
        await create_customer(
            client, customer_payload(phone=f"080000000{index}", first_name=f"Customer{index}")
        )
    response = await client.get("/api/v1/customers", params={"page": 2, "page_size": 2})
    assert response.status_code == 200
    data = response.json()
    assert data["page"] == 2
    assert data["page_size"] == 2
    assert data["total"] == 3
    assert data["total_pages"] == 2
    assert len(data["items"]) == 1


async def test_archived_customers_are_excluded_from_default_list(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    await client.post(f"/api/v1/customers/{customer['id']}/archive")
    response = await client.get("/api/v1/customers")
    assert response.status_code == 200
    assert response.json()["items"] == []


async def test_archived_customers_can_be_queried_via_archived_filter(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    await client.post(f"/api/v1/customers/{customer['id']}/archive")
    response = await client.get("/api/v1/customers", params={"archived": True})
    assert response.status_code == 200
    assert response.json()["items"][0]["id"] == customer["id"]


async def test_customer_can_be_restored(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    await client.post(f"/api/v1/customers/{customer['id']}/archive")
    response = await client.post(f"/api/v1/customers/{customer['id']}/restore")
    assert response.status_code == 200
    assert response.json()["archived_at"] is None


async def test_updating_phone_to_same_business_customer_number_returns_409(client):
    await register_owner(client, "owner@example.com")
    first = await create_customer(client, customer_payload(phone="080 123-4567"))
    await create_customer(client, customer_payload(phone="0810000000", first_name="Tola"))
    response = await client.patch(
        f"/api/v1/customers/{first['id']}", json={"phone": "081-000-0000"}
    )
    assert response.status_code == 409
