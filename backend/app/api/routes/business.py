from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_business, get_current_user, require_feature, require_permission, require_tenant_admin
from app.core.database import get_db_session
from app.models.business import Business
from app.models.user import User, UserRole
from app.schemas.admin import AdminAuditItem
from app.schemas.business import BusinessPublic, BusinessUpdate
from app.services.business_service import update_business
from app.services.business_audit_service import list_business_audit

router = APIRouter(prefix="/business", tags=["business"])


@router.get("", response_model=BusinessPublic)
async def get_business_settings(
    business: Annotated[Business, Depends(get_current_business)],
) -> BusinessPublic:
    return BusinessPublic.model_validate(business)


@router.patch(
    "",
    response_model=BusinessPublic,
    dependencies=[Depends(require_permission("business:settings"))],
)
async def patch_business_settings(
    payload: BusinessUpdate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> BusinessPublic:
    if (payload.audit_configuration is not None or payload.order_status_configuration is not None) and current_user.role not in {UserRole.OWNER, UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Business admin privilege required.")
    updated = await update_business(session, business, payload, current_user)
    return BusinessPublic.model_validate(updated)


@router.get("/audit", response_model=list[AdminAuditItem], dependencies=[Depends(require_feature("audit")), Depends(require_tenant_admin)])
async def get_business_audit_records(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[AdminAuditItem]:
    return await list_business_audit(session, business, limit)
