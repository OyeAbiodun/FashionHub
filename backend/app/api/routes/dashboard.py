from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_business
from app.core.database import get_db_session
from app.models.business import Business
from app.schemas.dashboard import (
    DashboardAlert,
    DashboardOrderItem,
    DashboardPaymentItem,
    DashboardSummary,
)
from app.services.dashboard_service import (
    get_dashboard_summary,
    get_due_orders,
    get_operational_alerts,
    get_recent_orders,
    get_recent_payments,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def dashboard_summary(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> DashboardSummary:
    return await get_dashboard_summary(session, business)


@router.get("/due-orders", response_model=list[DashboardOrderItem])
async def dashboard_due_orders(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    days: Annotated[int, Query(ge=0, le=30)] = 7,
    limit: Annotated[int, Query(ge=1, le=20)] = 10,
) -> list[DashboardOrderItem]:
    return await get_due_orders(session, business, days, limit)


@router.get("/recent-orders", response_model=list[DashboardOrderItem])
async def dashboard_recent_orders(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    limit: Annotated[int, Query(ge=1, le=20)] = 5,
) -> list[DashboardOrderItem]:
    return await get_recent_orders(session, business, limit)


@router.get("/recent-payments", response_model=list[DashboardPaymentItem])
async def dashboard_recent_payments(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    limit: Annotated[int, Query(ge=1, le=20)] = 5,
) -> list[DashboardPaymentItem]:
    return await get_recent_payments(session, business, limit)


@router.get("/alerts", response_model=list[DashboardAlert])
async def dashboard_alerts(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    limit: Annotated[int, Query(ge=1, le=50)] = 15,
) -> list[DashboardAlert]:
    return await get_operational_alerts(session, business, limit)
