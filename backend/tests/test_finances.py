from decimal import Decimal
from uuid import UUID

from conftest import register_payload
from sqlalchemy import select

from app.models.finance import Invoice, Payment, PaymentStatus
from app.models.order import OrderItem


async def register_owner(client, email: str = "owner@example.com") -> dict:
    response = await client.post("/api/v1/auth/register", json=register_payload(email))
    assert response.status_code == 201
    return {"cookies": dict(client.cookies), "session": response.json()}


def use_cookies(client, cookies: dict[str, str]) -> None:
    client.cookies.clear()
    for name, value in cookies.items():
        client.cookies.set(name, value)


async def customer(client, name: str = "Bisi", phone: str = "08012345670") -> dict:
    response = await client.post("/api/v1/customers", json={"first_name": name, "phone": phone})
    assert response.status_code == 201
    return response.json()


async def order(client, customer_id: str, discount: str = "500.00") -> dict:
    response = await client.post(
        "/api/v1/orders",
        json={
            "customer_id": customer_id,
            "order_date": "2026-08-09",
            "due_date": "2026-08-20",
            "reference_image": "data:image/png;base64,AA==",
            "discount_amount": discount,
            "items": [
                {"garment_type": "Agbada", "quantity": 2, "unit_price": "1000.10"},
                {"garment_type": "Trouser", "quantity": 1, "unit_price": "500.25"},
            ],
        },
    )
    assert response.status_code == 201
    return response.json()


async def pay(client, order_id: str, amount: str, **extra) -> dict:
    payload = {"amount": amount, "payment_method": "TRANSFER", **extra}
    response = await client.post(f"/api/v1/orders/{order_id}/payments", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


async def test_order_pricing_decimal_line_subtotal_discount_and_balance(client):
    await register_owner(client)
    created = await order(client, (await customer(client))["id"])
    assert created["items"][0]["unit_price"] == "1000.10"
    assert created["items"][0]["line_total"] == "2000.20"
    assert created["subtotal"] == "2500.45"
    assert created["discount_amount"] == "500.00"
    assert created["total"] == "2000.45"
    assert created["amount_paid"] == "0.00"
    assert created["outstanding_balance"] == "2000.45"
    async with client._transport.app.state.test_session_factory() as session:
        item = (
            (await session.execute(select(OrderItem).order_by(OrderItem.position)))
            .scalars()
            .first()
        )
        assert item.unit_price == Decimal("1000.10")


async def test_discount_above_subtotal_and_spoofed_financial_fields_are_rejected(client):
    await register_owner(client)
    customer_record = await customer(client)
    invalid = await client.post(
        "/api/v1/orders",
        json={
            "customer_id": customer_record["id"],
            "order_date": "2026-08-09",
            "due_date": "2026-08-20",
            "reference_image": "data:image/png;base64,AA==",
            "discount_amount": "10.01",
            "subtotal": "1.00",
            "items": [{"garment_type": "Top", "quantity": 1, "unit_price": "10.00"}],
        },
    )
    assert invalid.status_code == 422


async def test_payment_auth_ownership_derived_customer_and_multiple_balances(client):
    unauthenticated = await client.post(
        "/api/v1/orders/00000000-0000-0000-0000-000000000001/payments",
        json={"amount": "1.00", "payment_method": "CASH"},
    )
    assert unauthenticated.status_code == 401
    owner = await register_owner(client)
    customer_record = await customer(client)
    created = await order(client, customer_record["id"], "0.00")
    first = await pay(client, created["id"], "1000.10", reference="BANK-1")
    second = await pay(client, created["id"], "500.25")
    assert first["received_by"] == owner["session"]["user"]["id"]
    assert first["customer_id"] == customer_record["id"]
    detail = (await client.get(f"/api/v1/orders/{created['id']}")).json()
    assert detail["amount_paid"] == "1500.35"
    assert detail["outstanding_balance"] == "1000.10"
    history = (await client.get(f"/api/v1/orders/{created['id']}/payments")).json()
    assert [entry["id"] for entry in history] == [second["id"], first["id"]]


async def test_invalid_payment_overpayment_and_spoofing_are_rejected(client):
    await register_owner(client)
    created = await order(client, (await customer(client))["id"], "0.00")
    for amount in ["0.00", "-1.00"]:
        assert (
            await client.post(
                f"/api/v1/orders/{created['id']}/payments",
                json={"amount": amount, "payment_method": "CASH"},
            )
        ).status_code == 422
    assert (
        await client.post(
            f"/api/v1/orders/{created['id']}/payments",
            json={"amount": "2500.46", "payment_method": "CASH"},
        )
    ).status_code == 422
    assert (
        await client.post(
            f"/api/v1/orders/{created['id']}/payments",
            json={"amount": "1.00", "payment_method": "CASH", "status": "FAILED"},
        )
    ).status_code == 422


async def test_payment_tenant_scope_customer_pagination_and_status_source(client):
    first_owner = await register_owner(client, "one@example.com")
    customer_record = await customer(client)
    created = await order(client, customer_record["id"], "0.00")
    payment = await pay(client, created["id"], "10.00")
    page = (
        await client.get(
            f"/api/v1/customers/{customer_record['id']}/payments", params={"page_size": 1}
        )
    ).json()
    assert page["total"] == 1
    assert page["items"][0]["order_number"] == created["order_number"]
    await register_owner(client, "two@example.com")
    assert (await client.get(f"/api/v1/orders/{created['id']}/payments")).status_code == 404
    assert (
        await client.get(f"/api/v1/customers/{customer_record['id']}/payments")
    ).status_code == 404
    use_cookies(client, first_owner["cookies"])
    async with client._transport.app.state.test_session_factory() as session:
        stored = await session.get(Payment, UUID(payment["id"]))
        assert stored.status == PaymentStatus.SUCCESSFUL


async def test_invoice_generation_duplicate_totals_and_status_sync(client):
    await register_owner(client)
    created = await order(client, (await customer(client))["id"])
    response = await client.post(f"/api/v1/orders/{created['id']}/invoice", json={})
    assert response.status_code == 201
    invoice = response.json()
    assert invoice["invoice_number"] == "INV-000001"
    assert invoice["status"] == "ISSUED"
    assert invoice["items"][0]["line_total"] == "2000.20"
    assert invoice["financial_summary"]["total"] == "2000.45"
    duplicate = await client.post(f"/api/v1/orders/{created['id']}/invoice", json={})
    assert duplicate.status_code == 409
    await pay(client, created["id"], "1000.00")
    partial = (await client.get(f"/api/v1/invoices/{invoice['id']}")).json()
    assert partial["status"] == "PARTIALLY_PAID"
    await pay(client, created["id"], "1000.45")
    paid = (await client.get(f"/api/v1/orders/{created['id']}/invoice")).json()
    assert paid["status"] == "PAID"
    assert paid["financial_summary"]["outstanding_balance"] == "0.00"


async def test_invoice_number_tenant_scope_and_cross_tenant_access(client):
    first = await register_owner(client, "one@example.com")
    first_order = await order(client, (await customer(client))["id"])
    first_invoice = (
        await client.post(f"/api/v1/orders/{first_order['id']}/invoice", json={})
    ).json()
    second_order = await order(client, (await customer(client, "Tola", "08012345671"))["id"])
    second_invoice = (
        await client.post(f"/api/v1/orders/{second_order['id']}/invoice", json={})
    ).json()
    assert [first_invoice["invoice_number"], second_invoice["invoice_number"]] == [
        "INV-000001",
        "INV-000002",
    ]
    await register_owner(client, "two@example.com")
    assert (await client.get(f"/api/v1/invoices/{first_invoice['id']}")).status_code == 404
    assert (
        await client.post(f"/api/v1/orders/{first_order['id']}/invoice", json={})
    ).status_code == 404
    use_cookies(client, first["cookies"])
    async with client._transport.app.state.test_session_factory() as session:
        assert len((await session.execute(select(Invoice))).scalars().all()) == 2


async def test_delivered_can_receive_payment_cancelled_cannot(client):
    await register_owner(client)
    customer_record = await customer(client)
    delivered = await order(client, customer_record["id"], "0.00")
    for next_status in ["CUTTING", "SEWING", "FINISHING", "READY", "DELIVERED"]:
        await client.post(f"/api/v1/orders/{delivered['id']}/status", json={"status": next_status})
    assert (
        await client.post(
            f"/api/v1/orders/{delivered['id']}/payments",
            json={"amount": "1.00", "payment_method": "POS"},
        )
    ).status_code == 201
    cancelled = await order(client, customer_record["id"], "0.00")
    await client.post(f"/api/v1/orders/{cancelled['id']}/status", json={"status": "CANCELLED"})
    assert (
        await client.post(
            f"/api/v1/orders/{cancelled['id']}/payments",
            json={"amount": "1.00", "payment_method": "CASH"},
        )
    ).status_code == 409
    assert (
        await client.post(f"/api/v1/orders/{cancelled['id']}/invoice", json={})
    ).status_code == 409
