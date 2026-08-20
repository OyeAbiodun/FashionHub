import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_business, get_current_user
from app.core.database import get_db_session
from app.models.business import Business
from app.models.user import User
from app.schemas.role import RoleCreate, RolePublic, RoleUpdate
from app.services.role_service import (
    create_custom_role,
    delete_custom_role,
    list_roles,
    update_custom_role,
)

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("", response_model=list[RolePublic])
async def get_roles(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    _: Annotated[User, Depends(get_current_user)],
) -> list[RolePublic]:
    return await list_roles(session, business)


@router.post("", response_model=RolePublic, status_code=status.HTTP_201_CREATED)
async def add_custom_role(
    payload: RoleCreate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    _: Annotated[User, Depends(get_current_user)],
) -> RolePublic:
    return await create_custom_role(session, business, payload)


@router.patch("/{role_id}", response_model=RolePublic)
async def update_role(
    role_id: uuid.UUID,
    payload: RoleUpdate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    _: Annotated[User, Depends(get_current_user)],
) -> RolePublic:
    return await update_custom_role(session, business, role_id, payload)


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_role(
    role_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    _: Annotated[User, Depends(get_current_user)],
) -> None:
    await delete_custom_role(session, business, role_id)
