import hashlib
import hmac
import json
import time
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.core.email_secrets import encrypt_platform_email_secret
from app.models.platform_subscription import (
    BusinessSubscription,
    BusinessSubscriptionCharge,
    PlatformSubscriptionConfiguration,
)
from app.services.subscription_service import _webhook_is_valid


def test_stripe_webhook_signature_checks_raw_body_and_timestamp():
    body = b'{"id":"evt_123","type":"invoice.paid"}'
    timestamp = str(int(time.time()))
    secret = "whsec_test_secret"
    digest = hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()
    headers = {"stripe-signature": f"t={timestamp},v1={digest}"}

    assert _webhook_is_valid("STRIPE", body, headers, secret, None)
    assert not _webhook_is_valid("STRIPE", body + b" ", headers, secret, None)


def test_paystack_timestamped_signature_and_flutterwave_secret_hash():
    body = b'{"event":"charge.success"}'
    timestamp = str(int(time.time()))
    secret = "paystack_test_secret"
    digest = hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha512).hexdigest()
    headers = {"paystack-signature": f"t={timestamp},v1=key-1:{digest}"}
    assert _webhook_is_valid("PAYSTACK", body, headers, secret, None)

    assert _webhook_is_valid("FLUTTERWAVE", body, {"verif-hash": secret}, secret, None)
    assert not _webhook_is_valid("FLUTTERWAVE", body, {"verif-hash": "wrong"}, secret, None)


@pytest.mark.asyncio
async def test_paystack_recurring_charge_renews_and_is_idempotent(client):
    registration = await client.post(
        "/api/v1/auth/register",
        json={
            "user": {
                "first_name": "Renewal",
                "last_name": "Owner",
                "email": "renewal-owner@example.com",
                "phone": "+2348011111111",
                "password": "StrongPass123!",
            },
            "business": {"name": "Renewal Studio", "phone": "+2348022222222"},
        },
    )
    assert registration.status_code == 201
    business_id = registration.json()["business"]["id"]
    settings = get_settings()
    webhook_secret = "paystack-webhook-test-secret"
    async with client._transport.app.state.test_session_factory() as session:
        session.add(
            PlatformSubscriptionConfiguration(
                id=1,
                billing_provider="PAYSTACK",
                billing_mode="TEST",
                billing_secret_encrypted=encrypt_platform_email_secret(
                    "paystack-api-secret", settings
                ),
                billing_webhook_secret_encrypted=encrypt_platform_email_secret(
                    webhook_secret, settings
                ),
            )
        )
        subscription = BusinessSubscription(
            business_id=UUID(business_id),
            plan_id="studio",
            plan_name="Studio",
            amount=Decimal("5000.00"),
            currency="NGN",
            provider="PAYSTACK",
            billing_mode="TEST",
            provider_reference="fos_initial_checkout",
            provider_subscription_id="SUB_test123",
            provider_subscription_token_encrypted=encrypt_platform_email_secret(
                "customer-email-token", settings
            ),
            provider_customer_email="renewal-owner@example.com",
            status="ACTIVE",
            period_start=datetime.now(UTC) - timedelta(days=29),
            period_end=datetime.now(UTC) + timedelta(days=1),
        )
        session.add(subscription)
        await session.commit()
        subscription_id = subscription.id

    event = {
        "id": "evt-renewal-once",
        "event": "charge.success",
        "data": {
            "id": 99001,
            "reference": "fos_renewal_charge",
            "amount": 500000,
            "currency": "NGN",
            "status": "success",
            "paid_at": datetime.now(UTC).isoformat(),
            "customer": {"email": "renewal-owner@example.com"},
        },
    }
    body = json.dumps(event, separators=(",", ":")).encode()
    timestamp = str(int(time.time()))
    digest = hmac.new(
        webhook_secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha512
    ).hexdigest()
    headers = {"paystack-signature": f"t={timestamp},v1=whk_test:{digest}"}

    for _ in range(2):
        response = await client.post(
            "/api/v1/webhooks/billing/paystack", content=body, headers=headers
        )
        assert response.status_code == 200, response.text

    async with client._transport.app.state.test_session_factory() as session:
        subscription = await session.get(BusinessSubscription, subscription_id)
        charges = list(
            (
                await session.scalars(
                    select(BusinessSubscriptionCharge).where(
                        BusinessSubscriptionCharge.subscription_id == subscription_id
                    )
                )
            ).all()
        )
        assert subscription.status == "ACTIVE"
        period_end = subscription.period_end.replace(tzinfo=UTC)
        assert period_end > datetime.now(UTC) + timedelta(days=25)
        assert len(charges) == 1
        assert charges[0].reference == "fos_renewal_charge"
