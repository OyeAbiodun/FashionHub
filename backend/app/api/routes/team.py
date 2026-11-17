import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_current_business,
    get_current_user,
    require_feature,
    require_tenant_admin,
)
from app.core.config import Settings, get_settings
from app.core.database import get_db_session
from app.core.security import set_auth_cookies
from app.models.business import Business
from app.models.user import User
from app.schemas.auth import AuthSession
from app.schemas.team import (
    BusinessInvitationAccept,
    BusinessInvitationCreate,
    BusinessInvitationPublic,
    StaffPublic,
    StaffUpdate,
)
from app.services.auth_service import create_auth_tokens
from app.services.team_service import (
    accept_business_invitation,
    create_staff_invitation,
    list_business_invitations,
    list_team_members,
    resend_business_invitation,
    revoke_business_invitation,
    update_staff_member,
)

router = APIRouter(
    prefix="/team",
    tags=["team"],
    dependencies=[Depends(require_feature("team")), Depends(require_tenant_admin)],
)
public_invitation_router = APIRouter(
    prefix="/team/invitations", tags=["team invitations"]
)


@router.get("", response_model=list[StaffPublic])
async def get_team(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[StaffPublic]:
    return await list_team_members(session, business)


@router.post("", response_model=BusinessInvitationPublic, status_code=status.HTTP_201_CREATED)
async def invite_staff(
    payload: BusinessInvitationCreate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    current_user: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> BusinessInvitationPublic:
    return await create_staff_invitation(session, business, current_user, payload, settings)


@router.get("/invitations", response_model=list[BusinessInvitationPublic])
async def get_invitations(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> list[BusinessInvitationPublic]:
    return await list_business_invitations(session, business)


@router.delete("/invitations/{invitation_id}", response_model=BusinessInvitationPublic)
async def cancel_invitation(
    invitation_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> BusinessInvitationPublic:
    return await revoke_business_invitation(session, business, invitation_id)


@router.post("/invitations/{invitation_id}/resend", response_model=BusinessInvitationPublic)
async def resend_invitation(
    invitation_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    current_user: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> BusinessInvitationPublic:
    return await resend_business_invitation(
        session, business, current_user, invitation_id, settings
    )


@router.patch("/{user_id}", response_model=StaffPublic)
async def update_staff(
    user_id: uuid.UUID,
    payload: StaffUpdate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> StaffPublic:
    return await update_staff_member(session, business, current_user, user_id, payload)


@public_invitation_router.post("/accept", response_model=AuthSession)
async def accept_invitation(
    payload: BusinessInvitationAccept,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthSession:
    user = await accept_business_invitation(session, payload.token, payload.password)
    access_token, refresh_token = create_auth_tokens(user, settings)
    set_auth_cookies(response, access_token, refresh_token, settings)
    return AuthSession.model_validate({"user": user, "business": user.business})
