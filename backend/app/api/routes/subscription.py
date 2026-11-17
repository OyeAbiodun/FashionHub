from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_business, require_tenant_admin
from app.core.config import Settings, get_settings
from app.core.database import get_db_session
from app.models.business import Business
from app.models.user import User
from app.schemas.subscription import (
    SubscriptionBillingStatus,
    SubscriptionCheckoutRequest,
    SubscriptionCheckoutResponse,
    SubscriptionCheckoutVerifyRequest,
    SubscriptionPlanSelection,
    SubscriptionStatus,
)
from app.services.subscription_service import (
    cancel_business_subscription_renewal,
    create_subscription_checkout,
    get_business_subscription_status,
    list_business_subscription_payments,
    process_billing_webhook,
    select_business_plan,
    verify_subscription_checkout,
)

router = APIRouter(prefix="/subscription", tags=["subscription"])
webhook_router = APIRouter(prefix="/webhooks/billing", tags=["billing webhooks"])


@webhook_router.post("/{provider}")
async def receive_billing_webhook(
    provider: str,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, bool]:
    return await process_billing_webhook(
        session,
        provider,
        await request.body(),
        {key.lower(): value for key, value in request.headers.items()},
        settings,
    )


@router.get("/status", response_model=SubscriptionStatus)
async def get_subscription_status(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> SubscriptionStatus:
    return await get_business_subscription_status(session, business)


@router.get("/payments", response_model=list[SubscriptionBillingStatus])
async def get_subscription_payments(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> list[SubscriptionBillingStatus]:
    return await list_business_subscription_payments(session, business)


@router.post("/cancel", response_model=SubscriptionStatus)
async def cancel_subscription_renewal(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    _actor: Annotated[User, Depends(require_tenant_admin)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> SubscriptionStatus:
    return await cancel_business_subscription_renewal(session, business, settings)


@router.post("/select", response_model=SubscriptionStatus)
async def choose_subscription_plan(
    payload: SubscriptionPlanSelection,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    actor: Annotated[User, Depends(require_tenant_admin)],
) -> SubscriptionStatus:
    return await select_business_plan(session, business, actor, payload.plan_id)


@router.post("/checkout", response_model=SubscriptionCheckoutResponse)
async def begin_subscription_checkout(
    payload: SubscriptionCheckoutRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    actor: Annotated[User, Depends(require_tenant_admin)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> SubscriptionCheckoutResponse:
    return await create_subscription_checkout(session, business, actor, payload, settings)


@router.post("/checkout/verify", response_model=SubscriptionBillingStatus)
async def confirm_subscription_checkout(
    payload: SubscriptionCheckoutVerifyRequest,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> SubscriptionBillingStatus:
    return await verify_subscription_checkout(session, business, payload, settings)
