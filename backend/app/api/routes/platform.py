from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_super_admin
from app.core.config import Settings, get_settings
from app.core.database import get_db_session
from app.models.user import User
from app.schemas.auth import MessageResponse
from app.schemas.platform_email import (
    PlatformEmailConfigurationPublic,
    PlatformEmailConfigurationUpdate,
    PlatformEmailTestRequest,
)
from app.services.admin_service import record_admin_action
from app.services.email_service import (
    get_platform_email_configuration,
    send_test_email,
    serialize_platform_email_configuration,
    update_platform_email_configuration,
)

router = APIRouter(prefix="/platform", tags=["platform"])


@router.get("/email", response_model=PlatformEmailConfigurationPublic)
async def get_platform_email(
    _: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PlatformEmailConfigurationPublic:
    return serialize_platform_email_configuration(await get_platform_email_configuration(session))


@router.put("/email", response_model=PlatformEmailConfigurationPublic)
async def put_platform_email(
    payload: PlatformEmailConfigurationUpdate,
    actor: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    request: Request,
) -> PlatformEmailConfigurationPublic:
    result = await update_platform_email_configuration(session, payload, settings)
    await record_admin_action(
        session,
        actor,
        "PLATFORM_EMAIL_CONFIGURATION_UPDATED",
        "Updated platform transactional email configuration",
        details={
            "provider": payload.provider.value,
            "enabled": payload.enabled,
            "smtp_host": payload.smtp_host,
        },
        request=request,
    )
    await session.commit()
    return result


@router.post("/email/test", response_model=MessageResponse)
async def test_platform_email(
    payload: PlatformEmailTestRequest,
    actor: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    request: Request,
) -> MessageResponse:
    success = await send_test_email(session, str(payload.recipient), settings)
    await record_admin_action(
        session,
        actor,
        "PLATFORM_EMAIL_TESTED",
        f"Platform email test {'succeeded' if success else 'failed'}",
        details={"result": "SUCCESS" if success else "FAILED"},
        request=request,
    )
    await session.commit()
    if not success:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Test email could not be delivered. Check the platform email settings.",
        )
    return MessageResponse(message="Test email sent successfully.")
