import asyncio
import os
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient, Cookies
from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import get_db_session
from app.core.measurement_defaults import SYSTEM_MEASUREMENT_TEMPLATES
from app.main import app
from app.models.business import Business
from app.models.finance import Invoice, InvoiceCounter, Payment, PaymentStatus
from app.models.order import OrderCounter

pytestmark = pytest.mark.postgres


@dataclass
class PostgresContext:
    session_factory: async_sessionmaker[AsyncSession]
    business_ids: list[uuid.UUID] = field(default_factory=list)

    @asynccontextmanager
    async def client(self, cookies: dict[str, str] | None = None):
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False),
            base_url="http://testserver",
            cookies=Cookies(cookies or {}),
        ) as client:
            yield client

    async def register(self, label: str) -> tuple[dict, dict[str, str]]:
        token = uuid.uuid4().hex
        payload = {
            "user": {
                "first_name": "Postgres",
                "last_name": label,
                "email": f"pg-{label}-{token}@example.com",
                "phone": "+2348011111111",
                "password": "StrongPass123!",
            },
            "business": {
                "name": f"Postgres {label}",
                "phone": "+2348022222222",
                "email": f"business-{label}-{token}@example.com",
                "address": "Lagos",
            },
        }
        async with self.client() as client:
            response = await client.post("/api/v1/auth/register", json=payload)
            assert response.status_code == 201, response.text
            result = response.json()
            cookies = {cookie.name: cookie.value for cookie in client.cookies.jar}
        self.business_ids.append(uuid.UUID(result["business"]["id"]))
        return result, cookies

    async def cleanup(self) -> None:
        async with self.session_factory() as session:
            for business_id in self.business_ids:
                parameters = {"business_id": business_id}
                await session.execute(
                    text(
                        "DELETE FROM order_status_history WHERE order_id IN "
                        "(SELECT id FROM orders WHERE business_id = :business_id)"
                    ),
                    parameters,
                )
                await session.execute(
                    text(
                        "DELETE FROM order_items WHERE order_id IN "
                        "(SELECT id FROM orders WHERE business_id = :business_id)"
                    ),
                    parameters,
                )
                for table_name in (
                    "payments",
                    "invoices",
                    "orders",
                    "measurement_profiles",
                    "customers",
                ):
                    await session.execute(
                        text(f"DELETE FROM {table_name} WHERE business_id = :business_id"),
                        parameters,
                    )
                await session.execute(delete(Business).where(Business.id == business_id))
            await session.commit()


@pytest.fixture
async def postgres_context() -> AsyncGenerator[PostgresContext, None]:
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for PostgreSQL integration tests")
    if not database_url.startswith("postgresql+asyncpg://"):
        pytest.fail("TEST_DATABASE_URL must use postgresql+asyncpg")

    engine = create_async_engine(database_url, pool_pre_ping=True)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.connect() as connection:
        identity = (await connection.execute(text("SELECT current_database(), current_user"))).one()
        if identity[0] != "fashionos_test":
            pytest.fail(f"Refusing PostgreSQL tests against database {identity[0]!r}")
        revision = await connection.scalar(text("SELECT version_num FROM alembic_version"))
        if revision != "20261117_0032":
            pytest.fail(f"PostgreSQL test database is not at head: {revision!r}")

    async def override_session() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            yield session

    context = PostgresContext(session_factory=session_factory)
    app.dependency_overrides[get_db_session] = override_session
    try:
        yield context
    finally:
        app.dependency_overrides.pop(get_db_session, None)
        if context.business_ids:
            await context.cleanup()
        await engine.dispose()


async def create_customer(context: PostgresContext, cookies: dict[str, str], label: str) -> dict:
    async with context.client(cookies) as client:
        response = await client.post(
            "/api/v1/customers",
            json={
                "first_name": label,
                "last_name": "Customer",
                "phone": f"080{uuid.uuid4().int % 10**8:08d}",
                "email": None,
                "address": "Lagos",
            },
        )
    assert response.status_code == 201, response.text
    return response.json()


def order_payload(
    customer_id: str,
    *,
    price: str = "100000.00",
    label: str = "Kaftan",
    measurement_profile_id: str | None = None,
):
    today = date.today()
    return {
        "customer_id": customer_id,
        "order_date": today.isoformat(),
        "due_date": (today + timedelta(days=14)).isoformat(),
        "reference_image": "data:image/png;base64,AA==",
        "items": [
            {
                "garment_type": label,
                "quantity": 1,
                "unit_price": price,
                "measurement_profile_id": measurement_profile_id,
            }
        ],
    }


async def create_order(
    context: PostgresContext,
    cookies: dict[str, str],
    customer_id: str,
    *,
    price: str = "100000.00",
    label: str = "Kaftan",
    measurement_profile_id: str | None = None,
) -> dict:
    async with context.client(cookies) as client:
        response = await client.post(
            "/api/v1/orders",
            json=order_payload(
                customer_id,
                price=price,
                label=label,
                measurement_profile_id=measurement_profile_id,
            ),
        )
    assert response.status_code == 201, response.text
    return response.json()


async def post_order(
    context: PostgresContext,
    cookies: dict[str, str],
    customer_id: str,
    index: int,
):
    async with context.client(cookies) as client:
        return await client.post(
            "/api/v1/orders",
            json=order_payload(customer_id, label=f"Garment {index}"),
        )


async def post_invoice(context: PostgresContext, cookies: dict[str, str], order_id: str):
    async with context.client(cookies) as client:
        return await client.post(f"/api/v1/orders/{order_id}/invoice", json={})


async def post_payment(
    context: PostgresContext,
    cookies: dict[str, str],
    order_id: str,
    amount: str,
):
    async with context.client(cookies) as client:
        return await client.post(
            f"/api/v1/orders/{order_id}/payments",
            json={"amount": amount, "payment_method": "TRANSFER"},
        )


async def test_postgres_schema_and_migration_seed(postgres_context: PostgresContext):
    expected_templates = {
        "Senator",
        "Agbada",
        "Shirt",
        "Trouser",
        "Suit",
        "Gown",
        "Blouse",
        "Skirt",
    }
    async with postgres_context.session_factory() as session:
        names = set(
            (
                await session.execute(
                    text("SELECT name FROM measurement_templates WHERE is_system_template IS TRUE")
                )
            ).scalars()
        )
        field_count = await session.scalar(
            text(
                "SELECT count(*) FROM measurement_template_fields AS fields "
                "JOIN measurement_templates AS templates ON templates.id = fields.template_id "
                "WHERE templates.is_system_template IS TRUE AND templates.business_id IS NULL"
            )
        )
    assert names == expected_templates
    assert field_count == sum(
        len(fields) for _name, _garment_type, fields in SYSTEM_MEASUREMENT_TEMPLATES
    )


async def test_postgres_order_counter_concurrency_and_tenant_isolation(
    postgres_context: PostgresContext,
):
    first, first_cookies = await postgres_context.register("orders-a")
    second, second_cookies = await postgres_context.register("orders-b")
    first_customer = await create_customer(postgres_context, first_cookies, "First")
    second_customer = await create_customer(postgres_context, second_cookies, "Second")

    invalid_payload = order_payload(first_customer["id"])
    invalid_payload["due_date"] = (date.today() - timedelta(days=1)).isoformat()
    async with postgres_context.client(first_cookies) as client:
        assert (await client.post("/api/v1/orders", json=invalid_payload)).status_code == 422

    first_responses, second_responses = await asyncio.gather(
        asyncio.gather(
            *[
                post_order(postgres_context, first_cookies, first_customer["id"], index)
                for index in range(10)
            ]
        ),
        asyncio.gather(
            *[
                post_order(postgres_context, second_cookies, second_customer["id"], index)
                for index in range(10)
            ]
        ),
    )
    assert {response.status_code for response in first_responses} == {201}
    assert {response.status_code for response in second_responses} == {201}
    expected_numbers = {f"ORD-{index:06d}" for index in range(1, 11)}
    assert {response.json()["order_number"] for response in first_responses} == expected_numbers
    assert {response.json()["order_number"] for response in second_responses} == expected_numbers

    first_invoices, second_invoices = await asyncio.gather(
        asyncio.gather(
            *[
                post_invoice(postgres_context, first_cookies, response.json()["id"])
                for response in first_responses
            ]
        ),
        asyncio.gather(
            *[
                post_invoice(postgres_context, second_cookies, response.json()["id"])
                for response in second_responses
            ]
        ),
    )
    expected_invoice_numbers = {f"INV-{index:06d}" for index in range(1, 11)}
    assert {response.status_code for response in first_invoices} == {201}
    assert {response.status_code for response in second_invoices} == {201}
    assert {
        response.json()["invoice_number"] for response in first_invoices
    } == expected_invoice_numbers
    assert {
        response.json()["invoice_number"] for response in second_invoices
    } == expected_invoice_numbers

    async with postgres_context.session_factory() as session:
        counters = {
            str(row.business_id): row.next_number
            for row in (
                await session.execute(
                    select(OrderCounter).where(
                        OrderCounter.business_id.in_(
                            [first["business"]["id"], second["business"]["id"]]
                        )
                    )
                )
            ).scalars()
        }
        invoice_counters = {
            str(row.business_id): row.next_number
            for row in (
                await session.execute(
                    select(InvoiceCounter).where(
                        InvoiceCounter.business_id.in_(
                            [first["business"]["id"], second["business"]["id"]]
                        )
                    )
                )
            ).scalars()
        }
    assert counters[first["business"]["id"]] == 11
    assert counters[second["business"]["id"]] == 11
    assert invoice_counters[first["business"]["id"]] == 11
    assert invoice_counters[second["business"]["id"]] == 11


async def test_postgres_invoice_concurrency_and_same_order_race(
    postgres_context: PostgresContext,
):
    registration, cookies = await postgres_context.register("invoices")
    customer = await create_customer(postgres_context, cookies, "Invoice")
    orders = await asyncio.gather(
        *[
            create_order(
                postgres_context, cookies, customer["id"], label=f"Invoice garment {index}"
            )
            for index in range(10)
        ]
    )

    invoice_responses = await asyncio.gather(
        *[post_invoice(postgres_context, cookies, order["id"]) for order in orders]
    )
    assert {response.status_code for response in invoice_responses} == {201}
    assert {response.json()["invoice_number"] for response in invoice_responses} == {
        f"INV-{index:06d}" for index in range(1, 11)
    }

    race_order = await create_order(
        postgres_context, cookies, customer["id"], label="Same order race"
    )
    race_responses = await asyncio.gather(
        *[post_invoice(postgres_context, cookies, race_order["id"]) for _index in range(5)]
    )
    assert sorted(response.status_code for response in race_responses) == [201, 409, 409, 409, 409]
    assert all(
        "IntegrityError" not in response.text and "sqlalchemy" not in response.text.lower()
        for response in race_responses
    )

    async with postgres_context.session_factory() as session:
        invoice_count = await session.scalar(
            select(func.count()).select_from(Invoice).where(Invoice.order_id == race_order["id"])
        )
        counter = await session.get(InvoiceCounter, uuid.UUID(registration["business"]["id"]))
    assert invoice_count == 1
    assert counter is not None and counter.next_number == 12


async def test_postgres_payment_overpayment_concurrency_and_rollback(
    postgres_context: PostgresContext,
):
    _registration, cookies = await postgres_context.register("payments")
    customer = await create_customer(postgres_context, cookies, "Payment")
    overpay_order = await create_order(postgres_context, cookies, customer["id"])

    overpay_responses = await asyncio.gather(
        post_payment(postgres_context, cookies, overpay_order["id"], "60000.00"),
        post_payment(postgres_context, cookies, overpay_order["id"], "60000.00"),
    )
    assert sorted(response.status_code for response in overpay_responses) == [201, 422]

    valid_order = await create_order(postgres_context, cookies, customer["id"])
    valid_responses = await asyncio.gather(
        post_payment(postgres_context, cookies, valid_order["id"], "40000.00"),
        post_payment(postgres_context, cookies, valid_order["id"], "60000.00"),
    )
    assert {response.status_code for response in valid_responses} == {201}

    async with postgres_context.client(cookies) as client:
        overpay_state = (await client.get(f"/api/v1/orders/{overpay_order['id']}")).json()
        valid_state = (await client.get(f"/api/v1/orders/{valid_order['id']}")).json()
    assert Decimal(overpay_state["amount_paid"]) == Decimal("60000.00")
    assert Decimal(overpay_state["outstanding_balance"]) == Decimal("40000.00")
    assert Decimal(valid_state["amount_paid"]) == Decimal("100000.00")
    assert Decimal(valid_state["outstanding_balance"]) == Decimal("0.00")

    async with postgres_context.session_factory() as session:
        overpay_rows = await session.scalar(
            select(func.count())
            .select_from(Payment)
            .where(
                Payment.order_id == overpay_order["id"],
                Payment.status == PaymentStatus.SUCCESSFUL,
            )
        )
    assert overpay_rows == 1


async def test_postgres_full_workflow_and_cross_tenant_security(
    postgres_context: PostgresContext,
):
    _first, first_cookies = await postgres_context.register("workflow")
    _second, second_cookies = await postgres_context.register("isolation")
    customer = await create_customer(postgres_context, first_cookies, "Workflow")

    async with postgres_context.client(first_cookies) as client:
        templates = (await client.get("/api/v1/measurement-templates")).json()
        senator = next(template for template in templates if template["name"] == "Senator")
        template = (await client.get(f"/api/v1/measurement-templates/{senator['id']}")).json()
        measurement_response = await client.post(
            f"/api/v1/customers/{customer['id']}/measurements",
            json={
                "template_id": senator["id"],
                "name": "Workflow Senator",
                "garment_type": "Senator",
                "unit": "INCH",
                "values": [
                    {
                        "field_key": field["field_key"],
                        "field_name": field["field_name"],
                        "value": "40.00",
                        "position": field["position"],
                    }
                    for field in template["fields"]
                ],
            },
        )
    assert measurement_response.status_code == 201, measurement_response.text
    measurement = measurement_response.json()

    order = await create_order(
        postgres_context,
        first_cookies,
        customer["id"],
        label="Workflow Senator",
        measurement_profile_id=measurement["id"],
    )
    async with postgres_context.client(first_cookies) as client:
        status_response = await client.post(
            f"/api/v1/orders/{order['id']}/status", json={"status": "CUTTING"}
        )
    assert status_response.status_code == 200
    assert (
        await post_payment(postgres_context, first_cookies, order["id"], "40000.00")
    ).status_code == 201
    invoice_response = await post_invoice(postgres_context, first_cookies, order["id"])
    assert invoice_response.status_code == 201, invoice_response.text
    invoice = invoice_response.json()
    assert (
        await post_payment(postgres_context, first_cookies, order["id"], "60000.00")
    ).status_code == 201

    async with postgres_context.client(first_cookies) as client:
        paid_invoice = await client.get(f"/api/v1/invoices/{invoice['id']}")
        dashboard = await client.get("/api/v1/dashboard/summary")
        settings = await client.patch(
            "/api/v1/business",
            json={"currency": "GBP", "timezone": "Europe/London"},
        )
        injection = await client.patch("/api/v1/business", json={"business_id": str(uuid.uuid4())})
        injection_search = await client.get("/api/v1/orders", params={"search": "%' OR 1=1 --"})
    assert paid_invoice.status_code == 200 and paid_invoice.json()["status"] == "PAID"
    assert dashboard.status_code == 200
    assert Decimal(dashboard.json()["outstanding_balance"]) == Decimal("0.00")
    assert settings.status_code == 200
    assert settings.json()["currency"] == "GBP"
    assert injection.status_code == 422
    assert injection_search.status_code == 200
    assert injection_search.json()["total"] == 0

    async with postgres_context.client(second_cookies) as client:
        assert (
            await client.get(f"/api/v1/measurement-profiles/{measurement['id']}")
        ).status_code == 404
        assert (await client.get(f"/api/v1/orders/{order['id']}")).status_code == 404
        assert (await client.get(f"/api/v1/invoices/{invoice['id']}")).status_code == 404
