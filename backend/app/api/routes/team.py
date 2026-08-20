import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_current_business,
    get_current_user,
    require_feature,
    require_tenant_admin,
)
from app.core.database import get_db_session
from app.models.business import Business
from app.models.user import User
from app.schemas.team import StaffCreate, StaffPublic, StaffUpdate
from app.services.team_service import (
    create_staff_member,
    list_team_members,
    update_staff_member,
)

router = APIRouter(
    prefix="/team",
    tags=["team"],
    dependencies=[Depends(require_feature("team")), Depends(require_tenant_admin)],
)


@router.get("", response_model=list[StaffPublic])
async def get_team(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[StaffPublic]:
    return await list_team_members(session, business)


@router.post("", response_model=StaffPublic, status_code=status.HTTP_201_CREATED)
async def add_staff(
    payload: StaffCreate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> StaffPublic:
    return await create_staff_member(session, business, current_user, payload)


@router.patch("/{user_id}", response_model=StaffPublic)
async def update_staff(
    user_id: uuid.UUID,
    payload: StaffUpdate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> StaffPublic:
    return await update_staff_member(session, business, current_user, user_id, payload)
