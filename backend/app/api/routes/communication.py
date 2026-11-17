import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_business, get_current_user, require_feature_permission
from app.core.config import Settings, get_settings
from app.core.database import get_db_session
from app.models.business import Business
from app.models.user import User
from app.schemas.communication import (
    CommunicationCreate,
    CommunicationOutcome,
    CommunicationPublic,
    MessageTemplatePublic,
    MessageTemplateWrite,
    ReminderCandidateList,
)
from app.services.communication_service import (
    archive_template,
    list_communications,
    list_templates,
    prepare_communication,
    record_communication_outcome,
    reminder_candidates,
    save_template,
    send_communication_email,
)

router = APIRouter(
    prefix="/communication",
    tags=["communication"],
    dependencies=[Depends(require_feature_permission("communication", "communication:read"))],
)


@router.get("/templates", response_model=list[MessageTemplatePublic])
async def get_templates(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> list[MessageTemplatePublic]:
    return await list_templates(session, business)


@router.post(
    "/templates",
    response_model=MessageTemplatePublic,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_feature_permission("communication", "communication:write"))],
)
async def add_template(
    payload: MessageTemplateWrite,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> MessageTemplatePublic:
    return await save_template(session, business, payload)


@router.put(
    "/templates/{template_id}",
    response_model=MessageTemplatePublic,
    dependencies=[Depends(require_feature_permission("communication", "communication:write"))],
)
async def edit_template(
    template_id: uuid.UUID,
    payload: MessageTemplateWrite,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> MessageTemplatePublic:
    return await save_template(session, business, payload, template_id)


@router.delete(
    "/templates/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_feature_permission("communication", "communication:write"))],
)
async def disable_template(
    template_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> None:
    await archive_template(session, business, template_id)


@router.get("/reminders", response_model=ReminderCandidateList)
async def get_reminder_candidates(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    days_ahead: Annotated[int, Query(ge=0, le=30)] = 7,
) -> ReminderCandidateList:
    return await reminder_candidates(session, business, days_ahead)


@router.get("/records", response_model=list[CommunicationPublic])
async def get_communications(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    customer_id: uuid.UUID | None = None,
) -> list[CommunicationPublic]:
    return await list_communications(session, business, customer_id)


@router.post(
    "/records",
    response_model=CommunicationPublic,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_feature_permission("communication", "communication:write"))],
)
async def create_communication(
    payload: CommunicationCreate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    actor: Annotated[User, Depends(get_current_user)],
) -> CommunicationPublic:
    return await prepare_communication(session, business, actor, payload)


@router.post(
    "/records/{communication_id}/outcome",
    response_model=CommunicationPublic,
    dependencies=[Depends(require_feature_permission("communication", "communication:write"))],
)
async def update_communication_outcome(
    communication_id: uuid.UUID,
    payload: CommunicationOutcome,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    actor: Annotated[User, Depends(get_current_user)],
) -> CommunicationPublic:
    return await record_communication_outcome(session, business, actor, communication_id, payload)


@router.post(
    "/records/{communication_id}/send",
    response_model=CommunicationPublic,
    dependencies=[Depends(require_feature_permission("communication", "communication:write"))],
)
async def send_customer_communication(
    communication_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    actor: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CommunicationPublic:
    return await send_communication_email(session, business, actor, communication_id, settings)
