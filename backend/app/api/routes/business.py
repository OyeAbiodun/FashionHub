from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_business, require_permission
from app.core.database import get_db_session
from app.models.business import Business
from app.schemas.business import BusinessPublic, BusinessUpdate
from app.services.business_service import update_business

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
) -> BusinessPublic:
    updated = await update_business(session, business, payload)
    return BusinessPublic.model_validate(updated)
