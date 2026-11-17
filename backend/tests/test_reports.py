from datetime import date, timedelta

from conftest import register_payload


async def test_top_customers_aggregate_all_orders_and_collections(client):
    registration = await client.post(
        "/api/v1/auth/register", json=register_payload("reports-owner@example.com")
    )
    assert registration.status_code == 201
    customer_response = await client.post(
        "/api/v1/customers", json={"first_name": "Bisi", "phone": "08012345678"}
    )
    assert customer_response.status_code == 201
    customer_id = customer_response.json()["id"]
    today = date.today()

    for amount in ("400.00", "600.00"):
        order_response = await client.post(
            "/api/v1/orders",
            json={
                "customer_id": customer_id,
                "order_date": today.isoformat(),
                "due_date": (today + timedelta(days=7)).isoformat(),
                "reference_image": "data:image/png;base64,AA==",
                "items": [{"garment_type": "Agbada", "quantity": 1, "unit_price": amount}],
            },
        )
        assert order_response.status_code == 201, order_response.text
        payment_response = await client.post(
            f"/api/v1/orders/{order_response.json()['id']}/payments",
            json={"amount": amount, "payment_method": "TRANSFER"},
        )
        assert payment_response.status_code == 201, payment_response.text

    report_response = await client.get(
        "/api/v1/reports/summary",
        params={
            "start_date": (today - timedelta(days=1)).isoformat(),
            "end_date": (today + timedelta(days=1)).isoformat(),
        },
    )
    assert report_response.status_code == 200, report_response.text
    report = report_response.json()
    assert report["totals"]["collected_revenue"] == "1000.00"
    assert len(report["top_customers"]) == 1
    assert report["top_customers"][0]["customer_name"] == "Bisi"
    assert report["top_customers"][0]["order_count"] == 2
    assert report["top_customers"][0]["collected_revenue"] == "1000.00"
