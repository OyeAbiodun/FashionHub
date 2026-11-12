import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_super_admin
from app.core.database import get_db_session
from app.models.user import User
from app.schemas.admin import (
    AdminAuditItem,
    BusinessTenantDetail,
    PlatformActivityItem,
    PlatformMetrics,
    UpdateBusinessEntitlements,
)
from app.services.admin_service import (
    get_business_tenant_detail,
    get_platform_metrics,
    get_recent_platform_activity,
    list_admin_audit,
    list_all_businesses,
    toggle_business_active,
    update_business_entitlements,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/metrics", response_model=PlatformMetrics)
async def get_metrics(
    _: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PlatformMetrics:
    return await get_platform_metrics(session)


@router.get("/businesses")
async def get_businesses(
    _: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    search: Annotated[str | None, Query(max_length=200)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    active_only: bool = False,
):
    items, total_count = await list_all_businesses(
        session, search=search, page=page, page_size=page_size, active_only=active_only
    )
    return {
        "items": items,
        "total": total_count,
        "page": page,
        "page_size": page_size,
    }


@router.get("/businesses/{business_id}", response_model=BusinessTenantDetail)
async def get_business(
    business_id: uuid.UUID,
    _: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> BusinessTenantDetail:
    return await get_business_tenant_detail(session, business_id)


@router.patch("/businesses/{business_id}/entitlements", response_model=BusinessTenantDetail)
async def update_entitlements(
    business_id: uuid.UUID,
    payload: UpdateBusinessEntitlements,
    actor: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
) -> BusinessTenantDetail:
    return await update_business_entitlements(session, business_id, payload, actor, request)


@router.post("/businesses/{business_id}/toggle-active", response_model=BusinessTenantDetail)
async def toggle_active(
    business_id: uuid.UUID,
    actor: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
) -> BusinessTenantDetail:
    return await toggle_business_active(session, business_id, actor, request)


@router.get("/activity", response_model=list[PlatformActivityItem])
async def get_activity(
    _: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[PlatformActivityItem]:
    return await get_recent_platform_activity(session, limit=limit)


@router.get("/audit", response_model=list[AdminAuditItem])
async def get_audit(
    _: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    search: Annotated[str | None, Query(max_length=200)] = None,
) -> list[AdminAuditItem]:
    return await list_admin_audit(session, limit=limit, search=search)
