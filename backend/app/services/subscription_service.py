import asyncio
import base64
import calendar
import hashlib
import hmac
import json
import re
import secrets
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.email_secrets import (
    PlatformEmailSecretError,
    decrypt_platform_email_secret,
    encrypt_platform_email_secret,
)
from app.models.business import Business
from app.models.platform_subscription import (
    BillingWebhookEvent,
    BusinessSubscription,
    BusinessSubscriptionCharge,
)
from app.models.platform_subscription import (
    PlatformSubscriptionConfiguration as SubscriptionConfigModel,
)
from app.models.user import User
from app.schemas.subscription import (
    BillingProviderTestRequest,
    BillingProviderTestResult,
    PlatformSubscriptionConfiguration,
    PlatformSubscriptionConfigurationUpdate,
    SubscriptionBillingStatus,
    SubscriptionCheckoutRequest,
    SubscriptionCheckoutResponse,
    SubscriptionCheckoutVerifyRequest,
    SubscriptionStatus,
)


def _credential_vault(row: SubscriptionConfigModel) -> dict:
    return row.provider_credentials if isinstance(row.provider_credentials, dict) else {}


def _credential_configured(
    row: SubscriptionConfigModel, provider: str, mode: str, key: str
) -> bool:
    entry = _credential_vault(row).get(provider, {}).get(mode, {})
    if key in entry:
        return bool(entry[key])
    if provider == row.billing_provider and mode == row.billing_mode:
        return bool(
            row.billing_secret_encrypted
            if key == "secret_encrypted"
            else row.billing_webhook_secret_encrypted
        )
    return False


def _credential_entry(row: SubscriptionConfigModel, provider: str, mode: str) -> dict:
    entry = _credential_vault(row).get(provider, {}).get(mode, {})
    if provider == row.billing_provider and mode == row.billing_mode:
        entry = dict(entry)
        entry.setdefault("secret_encrypted", row.billing_secret_encrypted)
        entry.setdefault("webhook_secret_encrypted", row.billing_webhook_secret_encrypted)
    return entry


def _credential_tested_at(entry: dict):
    value = entry.get("tested_at")
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return value


async def get_configuration(session: AsyncSession) -> PlatformSubscriptionConfiguration:
    row = await session.get(SubscriptionConfigModel, 1)
    if row is None:
        return PlatformSubscriptionConfiguration()
    credentials = _credential_vault(row)
    # Preserve visibility of credentials saved by older versions until the
    # operator saves them into the provider/environment vault.
    if row.billing_provider != "MANUAL" and row.billing_secret_encrypted:
        legacy = credentials.setdefault(row.billing_provider, {}).setdefault(row.billing_mode, {})
        legacy.setdefault("secret_configured", True)
        legacy.setdefault("webhook_secret_configured", bool(row.billing_webhook_secret_encrypted))
        legacy.setdefault(
            "tested_at",
            row.billing_secret_tested_at.isoformat() if row.billing_secret_tested_at else None,
        )
    return PlatformSubscriptionConfiguration.model_validate(
        {
            "enabled": row.enabled,
            "plans": row.plans or [],
            "billing_provider": row.billing_provider,
            "billing_mode": row.billing_mode,
            "billing_secret_configured": _credential_configured(
                row, row.billing_provider, row.billing_mode, "secret_encrypted"
            ),
            "billing_webhook_secret_configured": _credential_configured(
                row, row.billing_provider, row.billing_mode, "webhook_secret_encrypted"
            ),
            "provider_credentials": credentials,
        }
    )


async def save_configuration(
    session: AsyncSession,
    configuration: PlatformSubscriptionConfigurationUpdate,
    actor: User,
    settings: Settings,
    request=None,
) -> PlatformSubscriptionConfiguration:
    row = await session.get(SubscriptionConfigModel, 1)
    if row is None:
        row = SubscriptionConfigModel(id=1)
        session.add(row)
        previous_plans: dict[str, dict] = {}
    else:
        previous_plans = {
            str(plan.get("id")): plan for plan in (row.plans or []) if isinstance(plan, dict)
        }
    provider_changed = row.billing_provider != configuration.billing_provider
    mode_changed = row.billing_mode != configuration.billing_mode
    new_secret = configuration.billing_secret
    new_webhook_secret = configuration.billing_webhook_secret
    vault = _credential_vault(row)
    selected_entry = vault.setdefault(configuration.billing_provider, {}).setdefault(
        configuration.billing_mode, {}
    )
    legacy_selected = provider_changed or mode_changed
    now = datetime.now(UTC)
    active_subscriptions = (
        await session.scalars(
            select(BusinessSubscription).where(
                BusinessSubscription.status.in_(["ACTIVE", "PAST_DUE"]),
                BusinessSubscription.period_end > now,
            )
        )
    ).all()
    if active_subscriptions and (
        row.billing_provider != configuration.billing_provider
        or row.billing_mode != configuration.billing_mode
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Billing provider and environment cannot change while "
                "paid subscriptions are active."
            ),
        )
    if provider_changed or mode_changed:
        if (
            configuration.billing_provider != "MANUAL"
            and new_webhook_secret is None
            and not selected_entry.get("webhook_secret_encrypted")
            and not (not legacy_selected and row.billing_webhook_secret_encrypted)
        ):
            raise HTTPException(
                status_code=409,
                detail=(
                    "Enter and save the webhook signing secret for the selected "
                    "provider and test environment."
                ),
            )
    if active_subscriptions:
        for replacement_secret, encrypted_secret, field_name in (
            (
                new_secret,
                selected_entry.get("secret_encrypted") or row.billing_secret_encrypted,
                "provider key",
            ),
            (
                new_webhook_secret,
                selected_entry.get("webhook_secret_encrypted")
                or row.billing_webhook_secret_encrypted,
                "webhook signing secret",
            ),
        ):
            if replacement_secret and encrypted_secret:
                try:
                    existing_secret = decrypt_platform_email_secret(encrypted_secret, settings)
                except PlatformEmailSecretError as exc:
                    raise HTTPException(
                        status_code=503,
                        detail=(
                            f"Saved {field_name} cannot be checked. "
                            "Resolve credential access first."
                        ),
                    ) from exc
                if not hmac.compare_digest(replacement_secret, existing_secret):
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            f"The {field_name} cannot be rotated while paid subscriptions "
                            "are active."
                        ),
                    )
    plans_by_id = {plan.id: plan for plan in configuration.plans}
    for subscription in active_subscriptions:
        replacement = plans_by_id.get(subscription.plan_id)
        previous = previous_plans.get(subscription.plan_id, {})
        if replacement is None or not replacement.is_active:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Plan '{subscription.plan_name}' has an active subscription. "
                    "Keep it active until subscriptions end or are cancelled."
                ),
            )
        if (
            Decimal(replacement.monthly_price) != subscription.amount
            or replacement.currency != subscription.currency
            or previous.get("currency", replacement.currency) != replacement.currency
        ):
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Price or currency for '{subscription.plan_name}' cannot change "
                    "while customers have active subscriptions."
                ),
            )
    row.enabled = configuration.enabled
    row.plans = [plan.model_dump(mode="json") for plan in configuration.plans]
    if new_secret is not None and len(new_secret.strip()) < 8:
        raise HTTPException(status_code=422, detail="Provider secret key is too short.")
    if (
        configuration.enabled
        and configuration.billing_provider == "MANUAL"
        and any(plan.is_active and Decimal(plan.monthly_price) > 0 for plan in configuration.plans)
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Manual subscription activation is not available yet. Choose an online "
                "provider or keep paid plans inactive while subscription access is required."
            ),
        )
    if (
        configuration.enabled
        and configuration.billing_provider != "MANUAL"
        and any(plan.is_active and Decimal(plan.monthly_price) > 0 for plan in configuration.plans)
        and not (
            new_webhook_secret
            or selected_entry.get("webhook_secret_encrypted")
            or (not legacy_selected and row.billing_webhook_secret_encrypted)
        )
    ):
        raise HTTPException(
            status_code=409,
            detail="Configure the provider webhook signing secret before enabling paid plans.",
        )
    if configuration.billing_provider == "MANUAL":
        pass
    else:
        needs_test = provider_changed or mode_changed
        if needs_test:
            if new_secret is not None:
                candidate_hash = hashlib.sha256(new_secret.encode("utf-8")).hexdigest()
            elif selected_entry.get("secret_encrypted") or (
                not legacy_selected and row.billing_secret_encrypted
            ):
                try:
                    existing_secret = decrypt_platform_email_secret(
                        selected_entry.get("secret_encrypted") or row.billing_secret_encrypted,
                        settings,
                    )
                except PlatformEmailSecretError as exc:
                    raise HTTPException(
                        status_code=503,
                        detail=(
                            "Saved billing credentials cannot be decrypted. "
                            "Re-enter the provider key."
                        ),
                    ) from exc
                candidate_hash = hashlib.sha256(existing_secret.encode("utf-8")).hexdigest()
            else:
                candidate_hash = None
            if (
                candidate_hash is None
                or selected_entry.get(
                    "tested_hash", row.billing_secret_tested_hash if not legacy_selected else None
                )
                != candidate_hash
                or _credential_tested_at(selected_entry) is None
                or (
                    datetime.now(UTC) - _as_utc(_credential_tested_at(selected_entry))
                ).total_seconds()
                > 600
            ):
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Test the selected provider and current key successfully "
                        "before confirming these settings."
                    ),
                )
        if new_secret is not None:
            candidate_hash = hashlib.sha256(new_secret.encode("utf-8")).hexdigest()
            if (
                selected_entry.get(
                    "tested_hash", row.billing_secret_tested_hash if not legacy_selected else None
                )
                != candidate_hash
                or _credential_tested_at(selected_entry) is None
                or (
                    datetime.now(UTC) - _as_utc(_credential_tested_at(selected_entry))
                ).total_seconds()
                > 600
            ):
                raise HTTPException(
                    status_code=409,
                    detail="Test the new provider key successfully before saving it.",
                )
        if new_secret is not None:
            try:
                selected_entry["secret_encrypted"] = encrypt_platform_email_secret(
                    new_secret, settings
                )
            except PlatformEmailSecretError as exc:
                raise HTTPException(
                    status_code=503,
                    detail="Platform credential encryption is not configured.",
                ) from exc
        if new_webhook_secret is not None:
            try:
                selected_entry["webhook_secret_encrypted"] = encrypt_platform_email_secret(
                    new_webhook_secret, settings
                )
            except PlatformEmailSecretError as exc:
                raise HTTPException(
                    status_code=503,
                    detail="Platform credential encryption is not configured.",
                ) from exc
        # Mirror the active credentials for old integrations during the rollout.
        row.billing_secret_encrypted = selected_entry.get("secret_encrypted") or (
            row.billing_secret_encrypted if not legacy_selected else None
        )
        row.billing_webhook_secret_encrypted = selected_entry.get("webhook_secret_encrypted") or (
            row.billing_webhook_secret_encrypted if not legacy_selected else None
        )
        selected_entry["secret_configured"] = bool(row.billing_secret_encrypted)
        selected_entry["webhook_secret_configured"] = bool(row.billing_webhook_secret_encrypted)
        row.billing_secret_tested_hash = selected_entry.get(
            "tested_hash", row.billing_secret_tested_hash if not legacy_selected else None
        )
        row.billing_secret_tested_provider = configuration.billing_provider
        row.billing_secret_tested_mode = configuration.billing_mode
        row.billing_secret_tested_at = _credential_tested_at(selected_entry)
    row.provider_credentials = vault
    row.billing_provider = configuration.billing_provider
    row.billing_mode = configuration.billing_mode
    updated_subscriber_counts: dict[str, int] = {}
    for plan in configuration.plans:
        previous = previous_plans.get(plan.id, {})
        previous_features = previous.get("features", [])
        previous_staff_limit = previous.get("max_staff_users", 10)
        if not plan.is_active or (
            previous_features == plan.features and previous_staff_limit == plan.max_staff_users
        ):
            continue
        businesses = (
            await session.scalars(select(Business).where(Business.subscription_plan_id == plan.id))
        ).all()
        for business in businesses:
            business.enabled_features = plan.features
            business.max_staff_users = plan.max_staff_users
        if businesses:
            updated_subscriber_counts[plan.id] = len(businesses)
    from app.services.admin_service import record_admin_action

    await record_admin_action(
        session,
        actor,
        "PLATFORM_SUBSCRIPTION_CONFIGURATION_UPDATED",
        "Updated platform subscription requirements and plan catalog",
        details={
            "enabled": configuration.enabled,
            "plan_ids": [plan.id for plan in configuration.plans],
            "billing_provider": configuration.billing_provider,
            "billing_mode": configuration.billing_mode,
            "updated_subscribers": updated_subscriber_counts,
        },
        request=request,
    )
    await session.commit()
    return await get_configuration(session)


PROVIDER_BALANCE_URLS = {
    "STRIPE": "https://api.stripe.com/v1/balance",
    "PAYSTACK": "https://api.paystack.co/balance",
    "FLUTTERWAVE": "https://api.flutterwave.com/v3/balances",
}


def _request_provider_balance(provider: str, secret: str) -> None:
    headers = {"Accept": "application/json"}
    if provider == "STRIPE":
        token = base64.b64encode(f"{secret}:".encode()).decode("ascii")
        headers["Authorization"] = f"Basic {token}"
    else:
        headers["Authorization"] = f"Bearer {secret}"
    request = UrlRequest(PROVIDER_BALANCE_URLS[provider], headers=headers, method="GET")
    try:
        with urlopen(request, timeout=12) as response:
            body = json.loads(response.read(1_000_000))
    except HTTPError as exc:
        if exc.code in {401, 403}:
            raise HTTPException(
                status_code=422,
                detail=(
                    "The provider rejected this key. Check that it matches the "
                    "selected provider and environment."
                ),
            ) from exc
        raise HTTPException(
            status_code=502,
            detail="The provider could not complete the credential check. Try again later.",
        ) from exc
    except (URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Could not reach or read the provider response. Check the network and try again."
            ),
        ) from exc
    if not isinstance(body, dict):
        raise HTTPException(
            status_code=502, detail="The provider returned an unexpected credential-check response."
        )
    if provider == "PAYSTACK" and body.get("status") is not True:
        raise HTTPException(status_code=422, detail="The provider rejected this key.")
    if provider == "FLUTTERWAVE" and body.get("status") != "success":
        raise HTTPException(status_code=422, detail="The provider rejected this key.")


async def test_billing_provider_connection(
    session: AsyncSession,
    payload: BillingProviderTestRequest,
    actor: User,
    settings: Settings,
    request=None,
) -> BillingProviderTestResult:
    row = await session.get(SubscriptionConfigModel, 1)
    secret = payload.billing_secret
    if secret is None and row is not None:
        saved_secret = (
            _credential_vault(row)
            .get(payload.billing_provider, {})
            .get(payload.billing_mode, {})
            .get("secret_encrypted")
        )
        if (
            not saved_secret
            and row.billing_provider == payload.billing_provider
            and row.billing_mode == payload.billing_mode
        ):
            saved_secret = row.billing_secret_encrypted
        if saved_secret:
            try:
                secret = decrypt_platform_email_secret(saved_secret, settings)
            except PlatformEmailSecretError as exc:
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "Saved billing credentials cannot be decrypted. Re-enter the provider key."
                    ),
                ) from exc
    if not secret:
        raise HTTPException(status_code=422, detail="Enter the provider secret key to test.")

    await asyncio.to_thread(_request_provider_balance, payload.billing_provider, secret)
    if row is None:
        row = SubscriptionConfigModel(id=1)
        session.add(row)
    vault = _credential_vault(row)
    entry = vault.setdefault(payload.billing_provider, {}).setdefault(payload.billing_mode, {})
    entry["tested_hash"] = hashlib.sha256(secret.encode("utf-8")).hexdigest()
    entry["tested_at"] = datetime.now(UTC).isoformat()
    if payload.billing_secret:
        try:
            entry["secret_encrypted"] = encrypt_platform_email_secret(secret, settings)
        except PlatformEmailSecretError as exc:
            raise HTTPException(
                status_code=503, detail="Platform credential encryption is not configured."
            ) from exc
    entry["secret_configured"] = bool(entry.get("secret_encrypted"))
    row.provider_credentials = vault
    row.billing_secret_tested_hash = entry["tested_hash"]
    row.billing_secret_tested_provider = payload.billing_provider
    row.billing_secret_tested_mode = payload.billing_mode
    row.billing_secret_tested_at = _credential_tested_at(entry)
    from app.services.admin_service import record_admin_action

    await record_admin_action(
        session,
        actor,
        "PLATFORM_BILLING_PROVIDER_TESTED",
        "Tested "
        f"{payload.billing_provider} provider credentials in "
        f"{payload.billing_mode.lower()} mode",
        details={
            "billing_provider": payload.billing_provider,
            "billing_mode": payload.billing_mode,
        },
        request=request,
    )
    await session.commit()
    return BillingProviderTestResult(
        billing_provider=payload.billing_provider,
        billing_mode=payload.billing_mode,
        connected=True,
        message="Provider accepted the credentials. No payment or charge was created.",
    )


async def get_business_subscription_status(
    session: AsyncSession, business: Business
) -> SubscriptionStatus:
    config = await get_configuration(session)
    active_plans = [plan for plan in config.plans if plan.is_active]
    selected = next(
        (plan for plan in active_plans if plan.id == business.subscription_plan_id), None
    )
    current_subscription = None
    paid_plan_access = True
    if selected is not None and Decimal(selected.monthly_price) > 0:
        current_subscription = await session.scalar(
            select(BusinessSubscription)
            .where(
                BusinessSubscription.business_id == business.id,
                BusinessSubscription.plan_id == selected.id,
                BusinessSubscription.status.in_(["ACTIVE", "PAST_DUE", "CANCELLED"]),
            )
            .order_by(BusinessSubscription.created_at.desc())
        )
        paid_plan_access = bool(
            current_subscription
            and current_subscription.status in {"ACTIVE", "PAST_DUE"}
            and current_subscription.period_end
            and _as_utc(current_subscription.period_end) > datetime.now(UTC)
        )
    return SubscriptionStatus(
        required=config.enabled,
        can_use_app=not config.enabled or (selected is not None and paid_plan_access),
        plans=active_plans,
        selected_plan=selected,
        selected_at=business.subscription_selected_at,
        billing_provider=config.billing_provider,
        billing_mode=config.billing_mode,
        subscription_status=current_subscription.status if current_subscription else None,
        period_end=current_subscription.period_end if current_subscription else None,
        cancel_at_period_end=(
            current_subscription.cancel_at_period_end if current_subscription else False
        ),
        automatic_renewal=bool(
            current_subscription
            and current_subscription.provider in {"STRIPE", "PAYSTACK", "FLUTTERWAVE"}
            and current_subscription.status in {"ACTIVE", "PAST_DUE"}
            and not current_subscription.cancel_at_period_end
        ),
        can_cancel_renewal=bool(
            current_subscription
            and current_subscription.status in {"ACTIVE", "PAST_DUE"}
            and not current_subscription.cancel_at_period_end
            and (
                (
                    current_subscription.provider == "STRIPE"
                    and current_subscription.provider_transaction_id
                )
                or (
                    current_subscription.provider == "PAYSTACK"
                    and current_subscription.provider_subscription_id
                    and current_subscription.provider_subscription_token_encrypted
                )
                or (
                    current_subscription.provider == "FLUTTERWAVE"
                    and current_subscription.provider_subscription_id
                )
            )
        ),
    )


async def _provider_secret(
    session: AsyncSession, settings: Settings, provider: str, mode: str
) -> str:
    row = await session.get(SubscriptionConfigModel, 1)
    encrypted = _credential_entry(row, provider, mode).get("secret_encrypted") if row else None
    if not encrypted:
        raise HTTPException(status_code=409, detail="Online billing is not fully configured.")
    try:
        return decrypt_platform_email_secret(encrypted, settings)
    except PlatformEmailSecretError as exc:
        raise HTTPException(
            status_code=503, detail="Billing credentials cannot be decrypted."
        ) from exc


def _provider_request(url: str, secret: str, payload: dict | None = None) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    request = UrlRequest(
        url,
        data=data,
        headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
        method="POST" if data is not None else "GET",
    )
    try:
        with urlopen(request, timeout=15) as response:
            value = json.loads(response.read(1_000_000))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=502, detail="Payment provider request failed.") from exc
    if not isinstance(value, dict):
        raise HTTPException(
            status_code=502, detail="Payment provider returned an invalid response."
        )
    return value


def _recurring_plan_key(
    provider: str, mode: str, plan_id: str, amount: Decimal, currency: str
) -> str:
    return ":".join((provider, mode, plan_id, f"{amount:.2f}", currency.upper()))


async def _get_or_create_recurring_plan(
    session: AsyncSession,
    config_row: SubscriptionConfigModel,
    provider: str,
    mode: str,
    plan_id: str,
    plan_name: str,
    amount: Decimal,
    currency: str,
    secret: str,
) -> str:
    mappings = dict(config_row.provider_plan_codes or {})
    key = _recurring_plan_key(provider, mode, plan_id, amount, currency)
    if mappings.get(key):
        return str(mappings[key])
    if provider == "PAYSTACK":
        response = await asyncio.to_thread(
            _provider_request,
            "https://api.paystack.co/plan",
            secret,
            {
                "name": f"FashionOS {plan_name} ({mode.lower()})",
                "amount": int((amount * 100).quantize(Decimal("1"))),
                "currency": currency.upper(),
                "interval": "monthly",
            },
        )
        data = response.get("data") or {}
        plan_code = data.get("plan_code")
        if response.get("status") is not True or not plan_code:
            raise HTTPException(
                status_code=502, detail="Paystack could not create a recurring plan."
            )
        provider_plan_id = str(plan_code)
    else:
        response = await asyncio.to_thread(
            _provider_request,
            "https://api.flutterwave.com/v3/payment-plans",
            secret,
            {
                "name": f"FashionOS {plan_name} ({mode.lower()})",
                "amount": f"{amount:.2f}",
                "currency": currency.upper(),
                "interval": "monthly",
            },
        )
        data = response.get("data") or {}
        plan_code = data.get("id")
        if response.get("status") != "success" or plan_code is None:
            raise HTTPException(
                status_code=502, detail="Flutterwave could not create a recurring plan."
            )
        provider_plan_id = str(plan_code)
    mappings[key] = provider_plan_id
    config_row.provider_plan_codes = mappings
    await session.commit()
    return provider_plan_id


def _next_month(value: datetime) -> datetime:
    next_month = value.month % 12 + 1
    next_year = value.year + (1 if value.month == 12 else 0)
    return value.replace(
        year=next_year,
        month=next_month,
        day=min(value.day, calendar.monthrange(next_year, next_month)[1]),
    )


def _provider_date(value) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return _as_utc(parsed)


async def create_subscription_checkout(
    session: AsyncSession,
    business: Business,
    actor: User,
    payload: SubscriptionCheckoutRequest,
    settings: Settings,
) -> SubscriptionCheckoutResponse:
    config = await get_configuration(session)
    if not config.enabled or config.billing_provider == "MANUAL":
        raise HTTPException(status_code=409, detail="Online subscription checkout is not enabled.")
    config_row = await session.get(SubscriptionConfigModel, 1)
    if config_row is None or not _credential_entry(
        config_row, config.billing_provider, config.billing_mode
    ).get("webhook_secret_encrypted"):
        raise HTTPException(
            status_code=409,
            detail="The platform webhook signing secret must be configured before checkout.",
        )
    plan = next(
        (item for item in config.plans if item.id == payload.plan_id and item.is_active), None
    )
    if plan is None or Decimal(plan.monthly_price) <= 0:
        raise HTTPException(status_code=404, detail="Paid subscription plan not found.")
    if plan.currency != business.currency:
        raise HTTPException(
            status_code=422, detail="Plan currency must match the business currency."
        )
    now = datetime.now(UTC)
    await session.scalar(select(Business.id).where(Business.id == business.id).with_for_update())
    active_subscription = await session.scalar(
        select(BusinessSubscription.id).where(
            BusinessSubscription.business_id == business.id,
            BusinessSubscription.status.in_(["ACTIVE", "PAST_DUE"]),
            BusinessSubscription.period_end > now,
        )
    )
    if active_subscription is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                "This business already has a current paid subscription. Cancel its renewal "
                "or wait until its paid period ends before starting another checkout."
            ),
        )
    recent_pending = await session.scalar(
        select(BusinessSubscription.id).where(
            BusinessSubscription.business_id == business.id,
            BusinessSubscription.status == "PENDING",
            BusinessSubscription.created_at >= now - timedelta(minutes=30),
        )
    )
    if recent_pending is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                "A recent checkout is still pending. Complete it or wait "
                "30 minutes before retrying."
            ),
        )
    secret = await _provider_secret(session, settings, config.billing_provider, config.billing_mode)
    reference = f"fos_{secrets.token_urlsafe(24)}"
    checkout_url: str | None = None
    amount_minor = int((Decimal(plan.monthly_price) * 100).quantize(Decimal("1")))
    api_base = (
        "https://api.paystack.co"
        if config.billing_provider == "PAYSTACK"
        else "https://api.flutterwave.com/v3"
    )
    if config.billing_provider == "PAYSTACK":
        provider_plan_id = await _get_or_create_recurring_plan(
            session,
            config_row,
            config.billing_provider,
            config.billing_mode,
            plan.id,
            plan.name,
            Decimal(plan.monthly_price),
            plan.currency,
            secret,
        )
        result = await asyncio.to_thread(
            _provider_request,
            f"{api_base}/transaction/initialize",
            secret,
            {
                "email": actor.email,
                "amount": amount_minor,
                "currency": plan.currency,
                "plan": provider_plan_id,
                "reference": reference,
                "callback_url": f"{settings.frontend_origin}/billing/return?reference={reference}",
                "metadata": {"business_id": str(business.id), "plan_id": plan.id},
            },
        )
        data = result.get("data") or {}
        checkout_url = data.get("authorization_url")
        reference = data.get("reference") or reference
        if result.get("status") is not True or not checkout_url:
            raise HTTPException(status_code=502, detail="Paystack could not create checkout.")
    elif config.billing_provider == "FLUTTERWAVE":
        provider_plan_id = await _get_or_create_recurring_plan(
            session,
            config_row,
            config.billing_provider,
            config.billing_mode,
            plan.id,
            plan.name,
            Decimal(plan.monthly_price),
            plan.currency,
            secret,
        )
        result = await asyncio.to_thread(
            _provider_request,
            f"{api_base}/payments",
            secret,
            {
                "tx_ref": reference,
                "amount": plan.monthly_price,
                "currency": plan.currency,
                "payment_plan": int(provider_plan_id),
                "redirect_url": f"{settings.frontend_origin}/billing/return?reference={reference}",
                "customer": {"email": actor.email, "name": f"{actor.first_name} {actor.last_name}"},
                "customizations": {"title": f"{business.name} · FashionOS {plan.name}"},
                "meta": {"business_id": str(business.id), "plan_id": plan.id},
            },
        )
        checkout_url = (result.get("data") or {}).get("link")
        if result.get("status") != "success" or not checkout_url:
            raise HTTPException(status_code=502, detail="Flutterwave could not create checkout.")
    elif config.billing_provider == "STRIPE":
        form = {
            "mode": "subscription",
            "success_url": (
                f"{settings.frontend_origin}/billing/return?reference={reference}"
                "&session_id={CHECKOUT_SESSION_ID}"
            ),
            "cancel_url": f"{settings.frontend_origin}/subscription",
            "customer_email": actor.email,
            "client_reference_id": reference,
            "metadata[business_id]": str(business.id),
            "metadata[plan_id]": plan.id,
            "line_items[0][quantity]": "1",
            "line_items[0][price_data][currency]": plan.currency.lower(),
            "line_items[0][price_data][unit_amount]": str(amount_minor),
            "line_items[0][price_data][recurring][interval]": "month",
            "line_items[0][price_data][product_data][name]": f"FashionOS {plan.name}",
        }
        request = UrlRequest(
            "https://api.stripe.com/v1/checkout/sessions",
            data=urlencode(form).encode(),
            headers={
                "Authorization": "Basic " + base64.b64encode(f"{secret}:".encode()).decode(),
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method="POST",
        )
        try:
            with await asyncio.to_thread(urlopen, request, timeout=15) as response:
                result = json.loads(response.read(1_000_000))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise HTTPException(
                status_code=502, detail="Stripe could not create checkout."
            ) from exc
        checkout_url = result.get("url")
        if not checkout_url:
            raise HTTPException(status_code=502, detail="Stripe did not return a checkout URL.")
    row = BusinessSubscription(
        business_id=business.id,
        plan_id=plan.id,
        plan_name=plan.name,
        amount=Decimal(plan.monthly_price),
        currency=plan.currency,
        provider=config.billing_provider,
        billing_mode=config.billing_mode,
        provider_reference=reference,
        provider_customer_email=actor.email.strip().lower(),
        checkout_url=checkout_url,
        status="PENDING",
    )
    session.add(row)
    await session.commit()
    return SubscriptionCheckoutResponse(
        provider=config.billing_provider, reference=reference, checkout_url=checkout_url
    )


async def verify_subscription_checkout(
    session: AsyncSession,
    business: Business,
    payload: SubscriptionCheckoutVerifyRequest,
    settings: Settings,
    *,
    commit: bool = True,
) -> SubscriptionBillingStatus:
    result = (
        await session.execute(
            select(BusinessSubscription).where(
                BusinessSubscription.business_id == business.id,
                BusinessSubscription.provider_reference == payload.reference,
            )
        )
    ).scalar_one_or_none()
    if result is None:
        raise HTTPException(status_code=404, detail="Subscription payment not found.")
    charge_amount = result.amount
    if result.status != "ACTIVE":
        secret = await _provider_secret(session, settings, result.provider, result.billing_mode)
        verified: dict
        if result.provider == "PAYSTACK":
            body = await asyncio.to_thread(
                _provider_request,
                f"https://api.paystack.co/transaction/verify/{result.provider_reference}",
                secret,
            )
            verified = body.get("data") or {}
            paid = (
                body.get("status") is True
                and verified.get("status") == "success"
                and int(verified.get("amount", 0)) == int(result.amount * 100)
                and verified.get("currency") == result.currency
            )
            transaction_id = str(verified.get("id") or "")
            charge_amount = Decimal(str(verified.get("amount", 0))) / Decimal(100)
        elif result.provider == "FLUTTERWAVE":
            if not payload.transaction_id or not re.fullmatch(r"\d+", payload.transaction_id):
                raise HTTPException(
                    status_code=422, detail="Flutterwave transaction ID is required."
                )
            body = await asyncio.to_thread(
                _provider_request,
                f"https://api.flutterwave.com/v3/transactions/{payload.transaction_id}/verify",
                secret,
            )
            verified = body.get("data") or {}
            paid = (
                body.get("status") == "success"
                and verified.get("status") == "successful"
                and verified.get("tx_ref") == result.provider_reference
                and Decimal(str(verified.get("amount", "0"))) == result.amount
                and verified.get("currency") == result.currency
            )
            transaction_id = str(verified.get("id") or "")
            charge_amount = Decimal(str(verified.get("amount", result.amount)))
        else:
            if not payload.checkout_session_id or not re.fullmatch(
                r"cs_[A-Za-z0-9_]+", payload.checkout_session_id
            ):
                raise HTTPException(
                    status_code=422, detail="Stripe checkout session ID is required."
                )
            request = UrlRequest(
                f"https://api.stripe.com/v1/checkout/sessions/{payload.checkout_session_id}",
                headers={
                    "Authorization": "Basic " + base64.b64encode(f"{secret}:".encode()).decode()
                },
            )
            try:
                with await asyncio.to_thread(urlopen, request, timeout=15) as response:
                    verified = json.loads(response.read(1_000_000))
            except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
                raise HTTPException(
                    status_code=502, detail="Stripe checkout verification failed."
                ) from exc
            paid = (
                verified.get("client_reference_id") == result.provider_reference
                and verified.get("mode") == "subscription"
                and verified.get("payment_status") == "paid"
                and int(verified.get("amount_total", 0)) == int(result.amount * 100)
                and verified.get("currency", "").upper() == result.currency
            )
            transaction_id = str(verified.get("subscription") or "")
            paid = paid and bool(re.fullmatch(r"sub_[A-Za-z0-9]+", transaction_id))
            charge_amount = result.amount
        if not paid:
            result.status = "FAILED"
            if commit:
                await session.commit()
            raise HTTPException(status_code=402, detail="Payment is not confirmed as successful.")
        now = datetime.now(UTC)
        if result.provider == "FLUTTERWAVE" and not result.provider_subscription_id:
            try:
                config_row = await session.get(SubscriptionConfigModel, 1)
                recurring_plan_id = (
                    dict(config_row.provider_plan_codes or {}).get(
                        _recurring_plan_key(
                            result.provider,
                            result.billing_mode,
                            result.plan_id,
                            result.amount,
                            result.currency,
                        )
                    )
                    if config_row
                    else None
                )
                if recurring_plan_id and result.provider_customer_email:
                    subscriptions = await asyncio.to_thread(
                        _provider_request,
                        "https://api.flutterwave.com/v3/subscriptions?"
                        + urlencode({"email": result.provider_customer_email}),
                        secret,
                    )
                    candidates = subscriptions.get("data") or []
                    match = next(
                        (
                            item
                            for item in candidates
                            if str(item.get("plan") or item.get("payment_plan") or "")
                            == str(recurring_plan_id)
                            and str(item.get("customer_email") or item.get("email") or "").lower()
                            == result.provider_customer_email
                            and str(item.get("status") or "").lower() == "active"
                        ),
                        None,
                    )
                    if match and match.get("id") is not None:
                        result.provider_subscription_id = str(match["id"])
            except HTTPException:
                # Payment verification is authoritative; provider subscription lookup is retryable.
                pass
        result.status = "ACTIVE"
        result.provider_transaction_id = transaction_id
        result.verified_at = now
        result.period_start = now
        result.period_end = _next_month(now)
        business.subscription_plan_id = result.plan_id
        business.subscription_selected_at = now
        plan = next(
            (
                item
                for item in (await get_configuration(session)).plans
                if item.id == result.plan_id
            ),
            None,
        )
        if plan:
            business.enabled_features = plan.features
            business.max_staff_users = plan.max_staff_users
    if result.status == "ACTIVE" and result.provider in {"PAYSTACK", "FLUTTERWAVE"}:
        await _upsert_subscription_charge(
            session,
            result,
            provider_charge_id=result.provider_transaction_id or result.provider_reference,
            amount=charge_amount,
            status="SUCCESSFUL",
            paid_at=result.verified_at,
            period_start=result.period_start,
            period_end=result.period_end,
        )
    if commit:
        await session.commit()
    return SubscriptionBillingStatus(
        status=result.status,
        plan_id=result.plan_id,
        plan_name=result.plan_name,
        amount=f"{result.amount:.2f}",
        currency=result.currency,
        provider=result.provider,
        reference=result.provider_reference,
        period_end=result.period_end,
    )


async def list_business_subscription_payments(
    session: AsyncSession, business: Business
) -> list[SubscriptionBillingStatus]:
    charge_rows = (
        await session.scalars(
            select(BusinessSubscriptionCharge)
            .where(BusinessSubscriptionCharge.business_id == business.id)
            .order_by(BusinessSubscriptionCharge.created_at.desc())
            .limit(100)
        )
    ).all()
    recorded_subscription_ids = {row.subscription_id for row in charge_rows}
    rows = (
        await session.scalars(
            select(BusinessSubscription)
            .where(BusinessSubscription.business_id == business.id)
            .order_by(BusinessSubscription.created_at.desc())
            .limit(200)
        )
    ).all()
    payments = [
        SubscriptionBillingStatus(
            status=row.status,
            plan_id=row.plan_id,
            plan_name=row.plan_name,
            amount=f"{row.amount:.2f}",
            currency=row.currency,
            provider=row.provider,
            reference=row.provider_reference,
            period_end=row.period_end,
            created_at=row.created_at,
            cancel_at_period_end=row.cancel_at_period_end,
        )
        for row in rows
        if row.status != "ACTIVE" or row.id not in recorded_subscription_ids
    ]
    payments.extend(
        SubscriptionBillingStatus(
            status=row.status,
            plan_id=row.plan_id,
            plan_name=row.plan_name,
            amount=f"{row.amount:.2f}",
            currency=row.currency,
            provider=row.provider,
            reference=row.provider_charge_id,
            period_end=row.period_end,
            created_at=row.created_at,
            cancel_at_period_end=False,
        )
        for row in charge_rows
    )
    payments.sort(
        key=lambda item: item.created_at.timestamp() if item.created_at else 0,
        reverse=True,
    )
    return payments[:100]


async def _upsert_subscription_charge(
    session: AsyncSession,
    subscription: BusinessSubscription,
    *,
    provider_charge_id: str,
    reference: str | None = None,
    amount: Decimal,
    status: str,
    paid_at: datetime | None,
    period_start: datetime | None,
    period_end: datetime | None,
) -> BusinessSubscriptionCharge:
    charge = await session.scalar(
        select(BusinessSubscriptionCharge).where(
            BusinessSubscriptionCharge.provider == subscription.provider,
            BusinessSubscriptionCharge.provider_charge_id == provider_charge_id,
        )
    )
    if charge is None:
        charge = BusinessSubscriptionCharge(
            business_id=subscription.business_id,
            subscription_id=subscription.id,
            provider=subscription.provider,
            provider_charge_id=provider_charge_id,
            reference=reference or subscription.provider_reference,
            amount=amount,
            currency=subscription.currency,
            status=status,
            paid_at=paid_at,
            period_start=period_start,
            period_end=period_end,
        )
        session.add(charge)
    else:
        charge.reference = reference or subscription.provider_reference
        charge.status = status
        charge.amount = amount
        charge.paid_at = paid_at
        charge.period_start = period_start
        charge.period_end = period_end
    return charge


async def _find_recurring_subscription(
    session: AsyncSession,
    provider: str,
    data: dict,
    *,
    subscription_id: str | None = None,
) -> BusinessSubscription | None:
    candidate_id = subscription_id or str(
        data.get("subscription_code")
        or (data.get("subscription") or {}).get("subscription_code")
        or data.get("subscription_id")
        or ""
    )
    if candidate_id:
        row = await session.scalar(
            select(BusinessSubscription).where(
                BusinessSubscription.provider == provider,
                BusinessSubscription.provider_subscription_id == candidate_id,
            )
        )
        if row is not None:
            return row
    customer = data.get("customer") or {}
    email = str(customer.get("email") or data.get("customer_email") or "").strip().lower()
    if not email:
        return None
    return await session.scalar(
        select(BusinessSubscription)
        .where(
            BusinessSubscription.provider == provider,
            BusinessSubscription.provider_customer_email == email,
            BusinessSubscription.status.in_(["ACTIVE", "PAST_DUE"]),
            BusinessSubscription.period_end > datetime.now(UTC) - timedelta(days=40),
        )
        .order_by(BusinessSubscription.created_at.desc())
    )


async def _apply_recurring_charge(
    session: AsyncSession,
    subscription: BusinessSubscription,
    *,
    provider_charge_id: str,
    reference: str,
    amount: Decimal,
    currency: str,
    successful: bool,
    paid_at: datetime | None,
) -> None:
    existing = await session.scalar(
        select(BusinessSubscriptionCharge.id).where(
            BusinessSubscriptionCharge.provider == subscription.provider,
            BusinessSubscriptionCharge.provider_charge_id == provider_charge_id,
        )
    )
    if existing is not None:
        return
    amount_matches = amount == subscription.amount and currency.upper() == subscription.currency
    if successful and amount_matches:
        now = datetime.now(UTC)
        old_end = _as_utc(subscription.period_end) if subscription.period_end else now
        period_start = old_end if old_end > now else now
        period_end = _next_month(period_start)
        subscription.status = "ACTIVE"
        subscription.period_start = period_start
        subscription.period_end = period_end
        subscription.verified_at = paid_at or now
        charge_status = "SUCCESSFUL"
    else:
        if not successful or not amount_matches:
            subscription.status = "PAST_DUE"
        period_start = subscription.period_start
        period_end = subscription.period_end
        charge_status = "FAILED"
    await _upsert_subscription_charge(
        session,
        subscription,
        provider_charge_id=provider_charge_id,
        reference=reference,
        amount=amount,
        status=charge_status,
        paid_at=paid_at if charge_status == "SUCCESSFUL" else None,
        period_start=period_start,
        period_end=period_end,
    )


async def cancel_business_subscription_renewal(
    session: AsyncSession,
    business: Business,
    settings: Settings,
) -> SubscriptionStatus:
    now = datetime.now(UTC)
    subscription = await session.scalar(
        select(BusinessSubscription)
        .where(
            BusinessSubscription.business_id == business.id,
            BusinessSubscription.provider.in_(["STRIPE", "PAYSTACK", "FLUTTERWAVE"]),
            BusinessSubscription.status.in_(["ACTIVE", "PAST_DUE"]),
            BusinessSubscription.period_end > now,
        )
        .order_by(BusinessSubscription.created_at.desc())
    )
    if subscription is None:
        raise HTTPException(
            status_code=409, detail="No current renewable subscription can be cancelled."
        )
    if subscription.cancel_at_period_end:
        return await get_business_subscription_status(session, business)
    provider = subscription.provider
    secret = await _provider_secret(session, settings, provider, subscription.billing_mode)
    if provider == "STRIPE":
        if not subscription.provider_transaction_id or not re.fullmatch(
            r"sub_[A-Za-z0-9]+", subscription.provider_transaction_id
        ):
            raise HTTPException(
                status_code=409, detail="Stripe subscription reference is unavailable."
            )
        request = UrlRequest(
            "https://api.stripe.com/v1/subscriptions/"
            f"{quote(subscription.provider_transaction_id, safe='')}",
            data=urlencode({"cancel_at_period_end": "true"}).encode(),
            headers={
                "Authorization": "Basic " + base64.b64encode(f"{secret}:".encode()).decode(),
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method="POST",
        )
        try:
            with await asyncio.to_thread(urlopen, request, timeout=15) as response:
                result = json.loads(response.read(1_000_000))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise HTTPException(
                status_code=502, detail="Stripe could not schedule cancellation."
            ) from exc
        if (
            result.get("id") != subscription.provider_transaction_id
            or result.get("cancel_at_period_end") is not True
        ):
            raise HTTPException(
                status_code=502, detail="Stripe did not confirm scheduled cancellation."
            )
        items = (result.get("items") or {}).get("data") or []
        period_end = items[0].get("current_period_end") if items else None
        if period_end:
            subscription.period_end = datetime.fromtimestamp(int(period_end), tz=UTC)
    elif provider == "PAYSTACK":
        if (
            not subscription.provider_subscription_id
            or not subscription.provider_subscription_token_encrypted
        ):
            raise HTTPException(
                status_code=409,
                detail="Paystack renewal details are still syncing. Try again shortly.",
            )
        try:
            email_token = decrypt_platform_email_secret(
                subscription.provider_subscription_token_encrypted, settings
            )
        except PlatformEmailSecretError as exc:
            raise HTTPException(
                status_code=503, detail="Paystack cancellation token cannot be decrypted."
            ) from exc
        result = await asyncio.to_thread(
            _provider_request,
            "https://api.paystack.co/subscription/disable",
            secret,
            {"code": subscription.provider_subscription_id, "token": email_token},
        )
        if result.get("status") is not True:
            raise HTTPException(status_code=502, detail="Paystack did not confirm cancellation.")
    else:
        if (
            not subscription.provider_subscription_id
            or not subscription.provider_subscription_id.isdigit()
        ):
            raise HTTPException(
                status_code=409, detail="Flutterwave subscription reference is unavailable."
            )
        request = UrlRequest(
            "https://api.flutterwave.com/v3/subscriptions/"
            f"{quote(subscription.provider_subscription_id, safe='')}/cancel",
            data=b"{}",
            headers={
                "Authorization": f"Bearer {secret}",
                "Content-Type": "application/json",
            },
            method="PUT",
        )
        try:
            with await asyncio.to_thread(urlopen, request, timeout=15) as response:
                result = json.loads(response.read(1_000_000))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise HTTPException(
                status_code=502, detail="Flutterwave could not cancel renewal."
            ) from exc
        if result.get("status") != "success":
            raise HTTPException(status_code=502, detail="Flutterwave did not confirm cancellation.")
    subscription.cancel_at_period_end = True
    await session.commit()
    return await get_business_subscription_status(session, business)


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _webhook_is_valid(
    provider: str, body: bytes, headers: dict[str, str], webhook_secret: str, api_secret: str | None
) -> bool:
    if provider == "FLUTTERWAVE":
        received = headers.get("verif-hash", "")
        return bool(received) and hmac.compare_digest(received, webhook_secret)
    if provider == "STRIPE":
        signature = headers.get("stripe-signature", "")
        fields = [item.split("=", 1) for item in signature.split(",") if "=" in item]
        timestamp = next((value for key, value in fields if key == "t"), "")
        try:
            signed_at = int(timestamp)
        except ValueError:
            return False
        if abs(int(datetime.now(UTC).timestamp()) - signed_at) > 300:
            return False
        expected = hmac.new(
            webhook_secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256
        ).hexdigest()
        return any(hmac.compare_digest(expected, value) for key, value in fields if key == "v1")

    signature = headers.get("paystack-signature", "")
    if signature:
        fields = [item.split("=", 1) for item in signature.split(",") if "=" in item]
        timestamp = next((value for key, value in fields if key == "t"), "")
        try:
            signed_at = int(timestamp)
        except ValueError:
            return False
        if abs(int(datetime.now(UTC).timestamp()) - signed_at) > 300:
            return False
        expected = hmac.new(
            webhook_secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha512
        ).hexdigest()
        return any(
            hmac.compare_digest(expected, value.rsplit(":", 1)[-1])
            for key, value in fields
            if key == "v1"
        )
    legacy = headers.get("x-paystack-signature", "")
    if legacy and api_secret:
        expected = hmac.new(api_secret.encode(), body, hashlib.sha512).hexdigest()
        return hmac.compare_digest(expected, legacy)
    return False


async def process_billing_webhook(
    session: AsyncSession,
    provider: str,
    body: bytes,
    headers: dict[str, str],
    settings: Settings,
) -> dict[str, bool]:
    normalized = provider.upper()
    if normalized not in {"STRIPE", "PAYSTACK", "FLUTTERWAVE"}:
        raise HTTPException(status_code=404, detail="Unsupported billing provider.")
    config = await session.get(SubscriptionConfigModel, 1)
    entry = _credential_entry(config, normalized, config.billing_mode) if config else {}
    if (
        config is None
        or config.billing_provider != normalized
        or not entry.get("webhook_secret_encrypted")
    ):
        raise HTTPException(status_code=503, detail="Billing webhook is not configured.")
    try:
        webhook_secret = decrypt_platform_email_secret(entry["webhook_secret_encrypted"], settings)
        api_secret = (
            decrypt_platform_email_secret(entry["secret_encrypted"], settings)
            if entry.get("secret_encrypted")
            else None
        )
        payload = json.loads(body)
    except (PlatformEmailSecretError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid billing webhook payload.") from exc
    if not _webhook_is_valid(normalized, body, headers, webhook_secret, api_secret):
        raise HTTPException(status_code=401, detail="Invalid webhook signature.")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid billing webhook payload.")

    event_type = str(payload.get("type") or payload.get("event") or "unknown")[:120]
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    provider_event_id = payload.get("id")
    if provider_event_id:
        event_id = str(provider_event_id)
    else:
        event_id = ":".join(
            [
                str(data.get("id") or data.get("reference") or data.get("tx_ref") or "event"),
                event_type,
            ]
        )
    if event_id == "event:unknown":
        event_id = hashlib.sha256(body).hexdigest()
    event_id = event_id[:160]
    existing = await session.scalar(
        select(BillingWebhookEvent.id).where(
            BillingWebhookEvent.provider == normalized,
            BillingWebhookEvent.event_id == event_id,
        )
    )
    if existing is not None:
        return {"accepted": True}

    session.add(BillingWebhookEvent(provider=normalized, event_id=event_id, event_type=event_type))
    if normalized == "PAYSTACK":
        if event_type == "subscription.create":
            plan = data.get("plan") or {}
            plan_code = str(plan.get("plan_code") or data.get("plan_code") or "")
            config_row = await session.get(SubscriptionConfigModel, 1)
            plan_id = (
                next(
                    (
                        key.rsplit(":", 3)[0].split(":", 2)[2]
                        for key, code in (config_row.provider_plan_codes or {}).items()
                        if str(code) == plan_code
                    ),
                    None,
                )
                if config_row
                else None
            )
            customer = data.get("customer") or {}
            email = str(customer.get("email") or "").strip().lower()
            if plan_id and email:
                payment = await session.scalar(
                    select(BusinessSubscription)
                    .where(
                        BusinessSubscription.provider == normalized,
                        BusinessSubscription.plan_id == plan_id,
                        BusinessSubscription.provider_customer_email == email,
                        BusinessSubscription.status.in_(["PENDING", "ACTIVE"]),
                    )
                    .order_by(BusinessSubscription.created_at.desc())
                )
                subscription_code = str(data.get("subscription_code") or "")
                email_token = data.get("email_token")
                if payment and subscription_code and email_token:
                    payment.provider_subscription_id = subscription_code
                    payment.provider_subscription_token_encrypted = encrypt_platform_email_secret(
                        str(email_token), settings
                    )
        elif event_type in {"subscription.not_renew", "subscription.disable"}:
            provider_subscription_id = str(data.get("subscription_code") or "")
            payment = await _find_recurring_subscription(
                session, normalized, data, subscription_id=provider_subscription_id
            )
            if payment:
                if event_type == "subscription.not_renew":
                    payment.cancel_at_period_end = True
                else:
                    payment.status = "CANCELLED"
                    payment.cancel_at_period_end = False
                    ended_at = _provider_date(data.get("next_payment_date"))
                    payment.period_end = ended_at or datetime.now(UTC)
        elif event_type == "charge.success":
            reference = str(data.get("reference") or "")
            payment = await session.scalar(
                select(BusinessSubscription).where(
                    BusinessSubscription.provider == normalized,
                    BusinessSubscription.provider_reference == reference,
                )
            )
            if payment is not None and payment.status == "PENDING":
                business = await session.get(Business, payment.business_id)
                await verify_subscription_checkout(
                    session,
                    business,
                    SubscriptionCheckoutVerifyRequest(reference=reference),
                    settings,
                    commit=False,
                )
            elif payment is None:
                payment = await _find_recurring_subscription(session, normalized, data)
                if payment:
                    amount = Decimal(str(data.get("amount", 0))) / Decimal(100)
                    await _apply_recurring_charge(
                        session,
                        payment,
                        provider_charge_id=str(data.get("id") or reference),
                        reference=reference,
                        amount=amount,
                        currency=str(data.get("currency") or ""),
                        successful=True,
                        paid_at=_provider_date(data.get("paid_at")) or datetime.now(UTC),
                    )
        elif event_type in {"invoice.update", "invoice.payment_failed"}:
            payment = await _find_recurring_subscription(session, normalized, data)
            if payment:
                transaction = data.get("transaction") or {}
                successful = event_type == "invoice.update" and (
                    str(data.get("status") or "").lower() in {"success", "paid"}
                    or data.get("paid") is True
                    or str(transaction.get("status") or "").lower() == "success"
                )
                raw_amount = transaction.get("amount", data.get("amount", 0))
                amount = Decimal(str(raw_amount)) / Decimal(100)
                transaction_id = transaction.get("id") or transaction.get("reference")
                provider_charge_id = str(
                    transaction_id or data.get("id") or data.get("invoice_code") or ""
                )
                if provider_charge_id:
                    await _apply_recurring_charge(
                        session,
                        payment,
                        provider_charge_id=provider_charge_id,
                        reference=str(
                            transaction.get("reference") or data.get("invoice_code") or ""
                        ),
                        amount=amount,
                        currency=str(transaction.get("currency") or data.get("currency") or ""),
                        successful=successful,
                        paid_at=_provider_date(transaction.get("paid_at")) or datetime.now(UTC),
                    )
    elif normalized == "FLUTTERWAVE" and event_type in {
        "charge.completed",
        "charge.completed.v2",
        "charge.failed",
    }:
        reference = str(data.get("tx_ref") or "")
        payment = await session.scalar(
            select(BusinessSubscription).where(
                BusinessSubscription.provider == normalized,
                BusinessSubscription.provider_reference == reference,
            )
        )
        if payment is not None and payment.status == "PENDING" and event_type != "charge.failed":
            business = await session.get(Business, payment.business_id)
            await verify_subscription_checkout(
                session,
                business,
                SubscriptionCheckoutVerifyRequest(
                    reference=reference, transaction_id=str(data.get("id") or "")
                ),
                settings,
                commit=False,
            )
        else:
            payment = payment or await _find_recurring_subscription(session, normalized, data)
            if payment:
                successful = (
                    event_type != "charge.failed"
                    and str(data.get("status") or "").lower() == "successful"
                )
                amount = Decimal(str(data.get("charged_amount", data.get("amount", 0))))
                charge_reference = reference or str(data.get("flw_ref") or data.get("id") or "")
                charge_id = str(data.get("id") or data.get("flw_ref") or charge_reference)
                if charge_id:
                    await _apply_recurring_charge(
                        session,
                        payment,
                        provider_charge_id=charge_id,
                        reference=charge_reference,
                        amount=amount,
                        currency=str(data.get("currency") or ""),
                        successful=successful,
                        paid_at=_provider_date(data.get("created_at")) or datetime.now(UTC),
                    )
    elif normalized == "STRIPE":
        if event_type == "checkout.session.completed":
            reference = str(data.get("client_reference_id") or "")
            payment = await session.scalar(
                select(BusinessSubscription).where(
                    BusinessSubscription.provider == normalized,
                    BusinessSubscription.provider_reference == reference,
                )
            )
            if payment is not None:
                business = await session.get(Business, payment.business_id)
                await verify_subscription_checkout(
                    session,
                    business,
                    SubscriptionCheckoutVerifyRequest(
                        reference=reference, checkout_session_id=str(data.get("id") or "")
                    ),
                    settings,
                    commit=False,
                )
        elif event_type in {"invoice.paid", "invoice.payment_failed"}:
            parent = data.get("parent") or {}
            parent_subscription = parent.get("subscription_details") or {}
            stripe_subscription = str(
                data.get("subscription") or parent_subscription.get("subscription") or ""
            )
            payment = await session.scalar(
                select(BusinessSubscription).where(
                    BusinessSubscription.provider == normalized,
                    BusinessSubscription.provider_transaction_id == stripe_subscription,
                )
            )
            if payment is None:
                await session.rollback()
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "Stripe subscription checkout is still being registered; "
                        "retry this webhook."
                    ),
                )
            if payment is not None:
                lines = (data.get("lines") or {}).get("data") or []
                subscription_line = next(
                    (
                        line
                        for line in lines
                        if _stripe_line_subscription(line) == stripe_subscription
                    ),
                    lines[0] if lines else {},
                )
                period = subscription_line.get("period") or {}
                period_start = _stripe_timestamp(period.get("start"))
                period_end = _stripe_timestamp(period.get("end"))
                amount_minor = data.get("amount_paid")
                charge_status = "SUCCESSFUL"
                if event_type == "invoice.paid" and (
                    str(data.get("currency") or "").upper() != payment.currency
                    or int(amount_minor or 0) != int(payment.amount * 100)
                ):
                    payment.status = "PAST_DUE"
                    charge_status = "FAILED"
                if event_type == "invoice.payment_failed":
                    payment.status = "PAST_DUE"
                    amount_minor = data.get("amount_due", 0)
                    charge_status = "FAILED"
                elif charge_status == "SUCCESSFUL":
                    if period_end:
                        payment.status = "ACTIVE"
                        payment.period_start = period_start or datetime.now(UTC)
                        payment.period_end = period_end
                        payment.verified_at = datetime.now(UTC)
                        business = await session.get(Business, payment.business_id)
                        business.subscription_plan_id = payment.plan_id
                        business.subscription_selected_at = payment.period_start
                        current_plan = next(
                            (plan for plan in config.plans if plan.id == payment.plan_id), None
                        )
                        if current_plan:
                            business.enabled_features = current_plan.features
                            business.max_staff_users = current_plan.max_staff_users
                invoice_id = str(data.get("id") or "")
                if invoice_id:
                    await _upsert_subscription_charge(
                        session,
                        payment,
                        provider_charge_id=invoice_id,
                        amount=Decimal(str(amount_minor or 0)) / Decimal(100),
                        status=charge_status,
                        paid_at=(
                            _stripe_timestamp((data.get("status_transitions") or {}).get("paid_at"))
                            if charge_status == "SUCCESSFUL"
                            else None
                        ),
                        period_start=period_start,
                        period_end=period_end,
                    )
        elif event_type == "customer.subscription.updated":
            stripe_subscription = str(data.get("id") or "")
            payment = await session.scalar(
                select(BusinessSubscription).where(
                    BusinessSubscription.provider == normalized,
                    BusinessSubscription.provider_transaction_id == stripe_subscription,
                    BusinessSubscription.status.in_(["ACTIVE", "PAST_DUE"]),
                )
            )
            if payment is not None:
                payment.cancel_at_period_end = bool(data.get("cancel_at_period_end"))
                items = (data.get("items") or {}).get("data") or []
                if items and items[0].get("current_period_end"):
                    payment.period_end = _stripe_timestamp(items[0]["current_period_end"])
        elif event_type == "customer.subscription.deleted":
            stripe_subscription = str(data.get("id") or "")
            payment = await session.scalar(
                select(BusinessSubscription).where(
                    BusinessSubscription.provider == normalized,
                    BusinessSubscription.provider_transaction_id == stripe_subscription,
                    BusinessSubscription.status.in_(["ACTIVE", "PAST_DUE"]),
                )
            )
            if payment is not None:
                payment.status = "CANCELLED"
                payment.period_end = datetime.now(UTC)
                payment.cancel_at_period_end = False
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        existing = await session.scalar(
            select(BillingWebhookEvent.id).where(
                BillingWebhookEvent.provider == normalized,
                BillingWebhookEvent.event_id == event_id,
            )
        )
        if existing is None:
            raise
    return {"accepted": True}


def _stripe_timestamp(value) -> datetime | None:
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(int(value), tz=UTC)
    except (TypeError, ValueError, OSError):
        return None


def _stripe_line_subscription(line: dict) -> str:
    parent = line.get("parent") or {}
    details = parent.get("subscription_item_details") or {}
    return str(line.get("subscription") or details.get("subscription") or "")


async def select_business_plan(
    session: AsyncSession,
    business: Business,
    actor: User,
    plan_id: str,
) -> SubscriptionStatus:
    config = await get_configuration(session)
    plan = next((item for item in config.plans if item.id == plan_id and item.is_active), None)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active plan not found")
    if Decimal(plan.monthly_price) > 0:
        raise HTTPException(
            status_code=409,
            detail="Paid plans must be activated through verified subscription checkout.",
        )
    current_paid_subscription = await session.scalar(
        select(BusinessSubscription.id).where(
            BusinessSubscription.business_id == business.id,
            BusinessSubscription.status.in_(["ACTIVE", "PAST_DUE"]),
            BusinessSubscription.period_end > datetime.now(UTC),
        )
    )
    if current_paid_subscription is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                "A paid subscription is still active. Cancel its renewal and wait until "
                "the current paid period ends before selecting another plan."
            ),
        )
    business.subscription_plan_id = plan.id
    business.subscription_selected_at = datetime.now(UTC)
    business.enabled_features = plan.features
    business.max_staff_users = plan.max_staff_users
    from app.services.order_service import add_business_audit

    add_business_audit(
        session,
        business,
        actor,
        "SUBSCRIPTION_PLAN_SELECTED",
        f"Selected the {plan.name} plan",
        details={
            "plan_id": plan.id,
            "features": plan.features,
            "max_staff_users": plan.max_staff_users,
        },
    )
    await session.commit()
    return await get_business_subscription_status(session, business)
