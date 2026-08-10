from datetime import date, timedelta

from conftest import register_payload
from sqlalchemy import select

from app.models.order import Order, OrderItem, OrderStatusHistory


async def register_owner(client, email: str):
    response = await client.post("/api/v1/auth/register", json=register_payload(email))
    assert response.status_code == 201
    return dict(client.cookies), response.json()


def use_cookies(client, cookies: dict[str, str]) -> None:
    client.cookies.clear()
    for name, value in cookies.items():
        client.cookies.set(name, value)


async def create_customer(client, first_name: str = "Bisi", phone: str = "08012345670") -> dict:
    response = await client.post(
        "/api/v1/customers",
        json={"first_name": first_name, "phone": phone},
    )
    assert response.status_code == 201
    return response.json()


async def senator_template(client) -> dict:
    templates = (await client.get("/api/v1/measurement-templates")).json()
    template_id = next(template["id"] for template in templates if template["name"] == "Senator")
    response = await client.get(f"/api/v1/measurement-templates/{template_id}")
    assert response.status_code == 200
    return response.json()


async def create_profile(client, customer_id: str, name: str = "Senator - Aug 2026") -> dict:
    template = await senator_template(client)
    response = await client.post(
        f"/api/v1/customers/{customer_id}/measurements",
        json={
            "template_id": template["id"],
            "name": name,
            "garment_type": template["garment_type"],
            "unit": "INCH",
            "values": [
                {
                    "field_key": field["field_key"],
                    "field_name": field["field_name"],
                    "value": "42.50",
                    "position": field["position"],
                }
                for field in template["fields"]
            ],
        },
    )
    assert response.status_code == 201
    return response.json()


def order_payload(customer_id: str, profile_id: str | None = None, due_date: str = "2026-08-20"):
    return {
        "customer_id": customer_id,
        "order_date": "2026-08-08",
        "due_date": due_date,
        "notes": "Wedding order.",
        "items": [
            {
                "garment_type": "Agbada",
                "description": "Blue brocade",
                "quantity": 1,
                "measurement_profile_id": profile_id,
                "style_reference_url": "https://example.com/style",
                "notes": "Add embroidery.",
            },
            {"garment_type": "Trouser", "quantity": 2},
        ],
    }


async def create_order(
    client,
    customer_id: str,
    profile_id: str | None = None,
    **overrides,
) -> dict:
    payload = order_payload(customer_id, profile_id)
    payload.update(overrides)
    response = await client.post("/api/v1/orders", json=payload)
    assert response.status_code == 201
    return response.json()


async def test_unauthenticated_order_list_returns_401(client):
    response = await client.get("/api/v1/orders")
    assert response.status_code == 401


async def test_owner_can_create_order_with_generated_number_and_items(client):
    _cookies, session_data = await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    profile = await create_profile(client, customer["id"])
    order = await create_order(client, customer["id"], profile["id"])
    assert order["order_number"] == "ORD-000001"
    assert order["created_by"] == session_data["user"]["id"]
    assert order["status"] == "CONFIRMED"
    assert len(order["items"]) == 2
    assert order["items"][0]["measurement_profile_name"] == profile["name"]
    assert order["status_history"][0]["new_status"] == "CONFIRMED"


async def test_order_number_is_unique_within_business(client):
    first_cookies, _ = await register_owner(client, "one@example.com")
    first_customer = await create_customer(client, "Bisi", "08010000001")
    first = await create_order(client, first_customer["id"])
    second = await create_order(client, first_customer["id"])
    assert [first["order_number"], second["order_number"]] == ["ORD-000001", "ORD-000002"]
    await register_owner(client, "two@example.com")
    second_customer = await create_customer(client, "Tola", "08010000002")
    third = await create_order(client, second_customer["id"])
    assert third["order_number"] == "ORD-000001"
    use_cookies(client, first_cookies)
    assert (await client.get(f"/api/v1/orders/{first['id']}")).status_code == 200


async def test_order_creation_validation_errors(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    zero_items = order_payload(customer["id"])
    zero_items["items"] = []
    assert (await client.post("/api/v1/orders", json=zero_items)).status_code == 422
    bad_quantity = order_payload(customer["id"])
    bad_quantity["items"][0]["quantity"] = 0
    assert (await client.post("/api/v1/orders", json=bad_quantity)).status_code == 422
    bad_due = order_payload(customer["id"])
    bad_due["due_date"] = "2026-08-01"
    assert (await client.post("/api/v1/orders", json=bad_due)).status_code == 422


async def test_cross_tenant_customer_and_measurement_profiles_are_rejected(client):
    first_cookies, _ = await register_owner(client, "one@example.com")
    first_customer = await create_customer(client, "Bisi", "08010000001")
    first_profile = await create_profile(client, first_customer["id"])
    await register_owner(client, "two@example.com")
    second_customer = await create_customer(client, "Tola", "08010000002")
    response = await client.post("/api/v1/orders", json=order_payload(first_customer["id"]))
    assert response.status_code == 404
    response = await client.post(
        "/api/v1/orders", json=order_payload(second_customer["id"], first_profile["id"])
    )
    assert response.status_code == 404
    use_cookies(client, first_cookies)
    assert (await client.get(f"/api/v1/customers/{first_customer['id']}")).status_code == 200


async def test_measurement_profile_must_belong_to_order_customer_and_can_be_absent(client):
    await register_owner(client, "owner@example.com")
    first_customer = await create_customer(client, "Bisi", "08010000001")
    second_customer = await create_customer(client, "Tola", "08010000002")
    other_profile = await create_profile(client, second_customer["id"])
    response = await client.post(
        "/api/v1/orders", json=order_payload(first_customer["id"], other_profile["id"])
    )
    assert response.status_code == 422
    order = await create_order(client, first_customer["id"])
    assert order["items"][0]["measurement_profile_id"] is None


async def test_archived_measurement_profile_cannot_be_used_for_new_order(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    profile = await create_profile(client, customer["id"])
    await client.post(f"/api/v1/measurement-profiles/{profile['id']}/archive")
    response = await client.post(
        "/api/v1/orders", json=order_payload(customer["id"], profile["id"])
    )
    assert response.status_code == 422


async def test_archived_customer_cannot_receive_a_new_order(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    assert (await client.post(f"/api/v1/customers/{customer['id']}/archive")).status_code == 200
    response = await client.post("/api/v1/orders", json=order_payload(customer["id"]))
    assert response.status_code == 409


async def test_order_filters_reject_unbounded_search_and_unknown_due_value(client):
    await register_owner(client, "owner@example.com")
    assert (await client.get("/api/v1/orders", params={"search": "x" * 201})).status_code == 422
    assert (await client.get("/api/v1/orders", params={"due": "someday"})).status_code == 422


async def test_order_detail_list_search_filters_and_tenant_scope(client):
    first_cookies, _ = await register_owner(client, "one@example.com")
    customer = await create_customer(client, "Bisi", "08010000001")
    order = await create_order(client, customer["id"])
    await register_owner(client, "two@example.com")
    other_customer = await create_customer(client, "Tola", "08010000002")
    await create_order(client, other_customer["id"])
    assert (await client.get(f"/api/v1/orders/{order['id']}")).status_code == 404
    use_cookies(client, first_cookies)
    detail = await client.get(f"/api/v1/orders/{order['id']}")
    assert detail.status_code == 200
    assert detail.json()["items"][0]["garment_type"] == "Agbada"
    for params in (
        {"search": order["order_number"]},
        {"search": "Bisi"},
        {"search": "08010000001"},
        {"status": "CONFIRMED"},
        {"customer_id": customer["id"]},
    ):
        data = (await client.get("/api/v1/orders", params=params)).json()
        assert data["total"] == 1
        assert data["items"][0]["id"] == order["id"]


async def test_overdue_filter_excludes_delivered_and_cancelled_orders(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    overdue = await create_order(
        client, customer["id"], order_date="2025-12-31", due_date="2026-01-01"
    )
    delivered = await create_order(
        client, customer["id"], order_date="2025-12-31", due_date="2026-01-02"
    )
    cancelled = await create_order(
        client, customer["id"], order_date="2025-12-31", due_date="2026-01-03"
    )
    await client.post(f"/api/v1/orders/{delivered['id']}/status", json={"status": "CUTTING"})
    await client.post(f"/api/v1/orders/{delivered['id']}/status", json={"status": "SEWING"})
    await client.post(f"/api/v1/orders/{delivered['id']}/status", json={"status": "FINISHING"})
    await client.post(f"/api/v1/orders/{delivered['id']}/status", json={"status": "READY"})
    await client.post(f"/api/v1/orders/{delivered['id']}/status", json={"status": "DELIVERED"})
    await client.post(f"/api/v1/orders/{cancelled['id']}/status", json={"status": "CANCELLED"})
    data = (await client.get("/api/v1/orders", params={"due": "overdue"})).json()
    assert data["total"] == 1
    assert data["items"][0]["id"] == overdue["id"]
    assert data["items"][0]["is_overdue"] is True


async def test_status_update_history_timestamps_and_terminal_rules(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    order = await create_order(client, customer["id"])
    invalid = await client.post(f"/api/v1/orders/{order['id']}/status", json={"status": "READY"})
    assert invalid.status_code == 422
    cutting = await client.post(
        f"/api/v1/orders/{order['id']}/status",
        json={"status": "CUTTING", "notes": "Fabric marked."},
    )
    assert cutting.status_code == 200
    assert len(cutting.json()["status_history"]) == 2
    cancelled = await client.post(
        f"/api/v1/orders/{order['id']}/status", json={"status": "CANCELLED"}
    )
    assert cancelled.json()["cancelled_at"] is not None
    terminal = await client.post(f"/api/v1/orders/{order['id']}/status", json={"status": "SEWING"})
    assert terminal.status_code == 422


async def test_delivered_status_sets_delivered_at_and_is_terminal(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    order = await create_order(client, customer["id"])
    for next_status in ["CUTTING", "SEWING", "FINISHING", "READY", "DELIVERED"]:
        response = await client.post(
            f"/api/v1/orders/{order['id']}/status", json={"status": next_status}
        )
    assert response.json()["delivered_at"] is not None
    terminal = await client.post(
        f"/api/v1/orders/{order['id']}/status", json={"status": "FINISHING"}
    )
    assert terminal.status_code == 422


async def test_cross_tenant_order_update_returns_404(client):
    await register_owner(client, "one@example.com")
    customer = await create_customer(client)
    order = await create_order(client, customer["id"])
    await register_owner(client, "two@example.com")
    response = await client.patch(f"/api/v1/orders/{order['id']}", json={"notes": "Nope"})
    assert response.status_code == 404


async def test_order_creation_rollback_occurs_if_item_fails(client, monkeypatch):
    from app.services import order_service

    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)

    class BrokenOrderItem:
        def __init__(self, **_kwargs):
            raise RuntimeError("item insert failed")

    monkeypatch.setattr(order_service, "OrderItem", BrokenOrderItem)
    response = await client.post("/api/v1/orders", json=order_payload(customer["id"]))
    assert response.status_code == 500
    async with client._transport.app.state.test_session_factory() as session:
        assert (await session.execute(select(Order))).scalars().all() == []
        assert (await session.execute(select(OrderItem))).scalars().all() == []
        assert (await session.execute(select(OrderStatusHistory))).scalars().all() == []


async def test_pagination_metadata_and_due_filters(client):
    await register_owner(client, "owner@example.com")
    customer = await create_customer(client)
    for index in range(3):
        await create_order(
            client,
            customer["id"],
            due_date=(date.today() + timedelta(days=index + 1)).isoformat(),
        )
    response = await client.get("/api/v1/orders", params={"page": 2, "page_size": 2})
    data = response.json()
    assert data["page"] == 2
    assert data["page_size"] == 2
    assert data["total"] == 3
    assert data["total_pages"] == 2
    assert len(data["items"]) == 1
    assert (await client.get("/api/v1/orders", params={"due": "upcoming"})).json()["total"] >= 1
