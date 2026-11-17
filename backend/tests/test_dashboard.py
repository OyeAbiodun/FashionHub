from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from conftest import register_payload

from app.core.timezone import business_today, current_month_utc_bounds
from app.models.business import Business
from app.models.finance import Payment, PaymentMethod, PaymentStatus
from app.models.order import Order, OrderStatus


async def register_owner(client, email: str = "owner@example.com") -> dict:
    response = await client.post("/api/v1/auth/register", json=register_payload(email))
    assert response.status_code == 201
    return {"cookies": dict(client.cookies), "session": response.json()}


def use_cookies(client, cookies: dict[str, str]) -> None:
    client.cookies.clear()
    for name, value in cookies.items():
        client.cookies.set(name, value)


async def create_customer(client, name: str, phone: str) -> dict:
    response = await client.post("/api/v1/customers", json={"first_name": name, "phone": phone})
    assert response.status_code == 201
    return response.json()


async def create_order(
    client,
    customer_id: str,
    due_date,
    price: str = "1000.00",
    garment: str = "Agbada",
) -> dict:
    response = await client.post(
        "/api/v1/orders",
        json={
            "customer_id": customer_id,
            "order_date": (due_date - timedelta(days=1)).isoformat(),
            "due_date": due_date.isoformat(),
            "reference_image": "data:image/png;base64,AA==",
            "items": [
                {
                    "garment_type": garment,
                    "quantity": 1,
                    "unit_price": price,
                }
            ],
            "discount_amount": "0.00",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def set_order_status(client, order_id: str, value: OrderStatus) -> None:
    async with client._transport.app.state.test_session_factory() as session:
        order = await session.get(Order, UUID(order_id))
        order.status = value
        await session.commit()


async def add_payment(
    client,
    owner: dict,
    order: dict,
    amount: str,
    payment_status: PaymentStatus,
    paid_at: datetime,
) -> None:
    async with client._transport.app.state.test_session_factory() as session:
        session.add(
            Payment(
                business_id=UUID(owner["session"]["business"]["id"]),
                order_id=UUID(order["id"]),
                customer_id=UUID(order["customer"]["id"]),
                amount=Decimal(amount),
                payment_method=PaymentMethod.CASH,
                status=payment_status,
                received_by=UUID(owner["session"]["user"]["id"]),
                paid_at=paid_at,
            )
        )
        await session.commit()


async def tenant_today(client, owner: dict):
    async with client._transport.app.state.test_session_factory() as session:
        business = await session.get(Business, UUID(owner["session"]["business"]["id"]))
        return business_today(business)


async def test_dashboard_requires_auth_and_empty_summary_is_zero(client):
    assert (await client.get("/api/v1/dashboard/summary")).status_code == 401
    await register_owner(client)
    response = await client.get("/api/v1/dashboard/summary")
    assert response.status_code == 200
    assert response.json() == {
        "total_customers": 0,
        "active_orders": 0,
        "due_today": 0,
        "overdue_orders": 0,
        "ready_for_pickup": 0,
        "collected_this_month": "0.00",
        "outstanding_balance": "0.00",
    }


async def test_summary_is_tenant_scoped_and_archived_customers_are_excluded(client):
    first = await register_owner(client, "one@example.com")
    active = await create_customer(client, "Bisi", "08010000001")
    archived = await create_customer(client, "Tola", "08010000002")
    await client.post(f"/api/v1/customers/{archived['id']}/archive")
    today = await tenant_today(client, first)
    await create_order(client, active["id"], today)
    assert (await client.get("/api/v1/dashboard/summary")).json()["total_customers"] == 1
    await register_owner(client, "two@example.com")
    second = (await client.get("/api/v1/dashboard/summary")).json()
    assert second["total_customers"] == 0
    assert second["active_orders"] == 0
    use_cookies(client, first["cookies"])
    assert (await client.get("/api/v1/dashboard/summary")).json()["due_today"] == 1


async def test_order_counts_use_business_date_and_exclude_terminal_orders(client):
    owner = await register_owner(client)
    customer = await create_customer(client, "Bisi", "08010000001")
    today = await tenant_today(client, owner)
    due = await create_order(client, customer["id"], today, garment="Due")
    overdue = await create_order(client, customer["id"], today - timedelta(days=3), garment="Late")
    delivered = await create_order(
        client, customer["id"], today - timedelta(days=2), garment="Delivered"
    )
    cancelled = await create_order(
        client, customer["id"], today - timedelta(days=1), garment="Cancelled"
    )
    ready = await create_order(client, customer["id"], today + timedelta(days=2), garment="Ready")
    await set_order_status(client, delivered["id"], OrderStatus.DELIVERED)
    await set_order_status(client, cancelled["id"], OrderStatus.CANCELLED)
    await set_order_status(client, ready["id"], OrderStatus.READY)
    summary = (await client.get("/api/v1/dashboard/summary")).json()
    assert summary["active_orders"] == 3
    assert summary["due_today"] == 1
    assert summary["overdue_orders"] == 1
    assert summary["ready_for_pickup"] == 1
    assert due["id"] != overdue["id"]


async def test_collected_month_respects_status_and_local_month_boundaries(client):
    owner = await register_owner(client)
    customer = await create_customer(client, "Bisi", "08010000001")
    today = await tenant_today(client, owner)
    order = await create_order(client, customer["id"], today + timedelta(days=2), "5000.00")
    async with client._transport.app.state.test_session_factory() as session:
        business = await session.get(Business, UUID(owner["session"]["business"]["id"]))
        business.timezone = "Pacific/Kiritimati"
        await session.commit()
        start, _end = current_month_utc_bounds(business)
    await add_payment(client, owner, order, "100.10", PaymentStatus.SUCCESSFUL, start)
    await add_payment(
        client, owner, order, "200.00", PaymentStatus.SUCCESSFUL, start - timedelta(microseconds=1)
    )
    await add_payment(client, owner, order, "300.00", PaymentStatus.PENDING, start)
    await add_payment(client, owner, order, "400.00", PaymentStatus.FAILED, start)
    await add_payment(client, owner, order, "500.00", PaymentStatus.REFUNDED, start)
    summary = (await client.get("/api/v1/dashboard/summary")).json()
    assert summary["collected_this_month"] == "100.10"


async def test_outstanding_includes_delivered_excludes_cancelled_and_fully_paid(client):
    owner = await register_owner(client)
    customer = await create_customer(client, "Bisi", "08010000001")
    today = await tenant_today(client, owner)
    active = await create_order(client, customer["id"], today + timedelta(days=1))
    delivered = await create_order(client, customer["id"], today + timedelta(days=2))
    cancelled = await create_order(client, customer["id"], today + timedelta(days=3))
    paid = await create_order(client, customer["id"], today + timedelta(days=4))
    await set_order_status(client, delivered["id"], OrderStatus.DELIVERED)
    await set_order_status(client, cancelled["id"], OrderStatus.CANCELLED)
    await add_payment(client, owner, paid, "1000.00", PaymentStatus.SUCCESSFUL, datetime.now(UTC))
    summary = (await client.get("/api/v1/dashboard/summary")).json()
    assert summary["outstanding_balance"] == "2000.00"
    assert active["id"] != delivered["id"]


async def test_due_and_recent_order_endpoints_are_scoped_sorted_and_limited(client):
    first = await register_owner(client, "one@example.com")
    customer = await create_customer(client, "Bisi", "08010000001")
    today = await tenant_today(client, first)
    later = await create_order(client, customer["id"], today + timedelta(days=2), garment="Later")
    overdue = await create_order(
        client, customer["id"], today - timedelta(days=2), garment="Overdue"
    )
    due = (await client.get("/api/v1/dashboard/due-orders", params={"limit": 2})).json()
    assert [item["id"] for item in due] == [overdue["id"], later["id"]]
    recent = (await client.get("/api/v1/dashboard/recent-orders", params={"limit": 1})).json()
    assert len(recent) == 1
    await register_owner(client, "two@example.com")
    assert (await client.get("/api/v1/dashboard/due-orders")).json() == []
    assert (await client.get("/api/v1/dashboard/recent-orders")).json() == []


async def test_recent_payments_are_successful_scoped_newest_and_limited(client):
    first = await register_owner(client, "one@example.com")
    customer = await create_customer(client, "Bisi", "08010000001")
    today = await tenant_today(client, first)
    order = await create_order(client, customer["id"], today + timedelta(days=1), "5000.00")
    now = datetime.now(UTC)
    await add_payment(
        client, first, order, "100.00", PaymentStatus.SUCCESSFUL, now - timedelta(days=1)
    )
    await add_payment(client, first, order, "200.00", PaymentStatus.SUCCESSFUL, now)
    await add_payment(
        client, first, order, "300.00", PaymentStatus.FAILED, now + timedelta(minutes=1)
    )
    payments = (await client.get("/api/v1/dashboard/recent-payments", params={"limit": 1})).json()
    assert len(payments) == 1
    assert payments[0]["amount"] == "200.00"
    await register_owner(client, "two@example.com")
    assert (await client.get("/api/v1/dashboard/recent-payments")).json() == []


async def test_alert_types_priority_limit_and_tenant_scope(client):
    first = await register_owner(client, "one@example.com")
    customer = await create_customer(client, "Bisi", "08010000001")
    today = await tenant_today(client, first)
    overdue = await create_order(client, customer["id"], today - timedelta(days=3), garment="Late")
    delivered = await create_order(
        client, customer["id"], today - timedelta(days=1), garment="Done"
    )
    await create_order(client, customer["id"], today, garment="Today")
    ready = await create_order(client, customer["id"], today + timedelta(days=2), garment="Ready")
    await set_order_status(client, delivered["id"], OrderStatus.DELIVERED)
    await set_order_status(client, ready["id"], OrderStatus.READY)
    alerts = (await client.get("/api/v1/dashboard/alerts")).json()
    assert [alert["type"] for alert in alerts] == [
        "OVERDUE_ORDER",
        "UNPAID_DELIVERED",
        "OUTSTANDING_BALANCE",
        "DUE_TODAY",
        "READY_FOR_PICKUP",
    ]
    assert alerts[0]["order_id"] == overdue["id"]
    assert len((await client.get("/api/v1/dashboard/alerts", params={"limit": 2})).json()) == 2
    await register_owner(client, "two@example.com")
    assert (await client.get("/api/v1/dashboard/alerts")).json() == []
