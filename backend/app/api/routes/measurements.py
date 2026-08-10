import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_business, get_current_user
from app.core.database import get_db_session
from app.models.business import Business
from app.models.user import User
from app.schemas.measurement import (
    GlobalMeasurementProfileListResponse,
    MeasurementProfileCreate,
    MeasurementProfileListResponse,
    MeasurementProfileResponse,
    MeasurementTemplateListItem,
    MeasurementTemplateResponse,
)
from app.services.measurement_service import (
    archive_measurement_profile,
    create_measurement_profile,
    get_measurement_profile,
    get_template,
    list_customer_measurement_profiles,
    list_measurement_profiles,
    list_templates,
    profile_response,
    restore_measurement_profile,
)

router = APIRouter(tags=["measurements"])


@router.get("/measurement-profiles", response_model=GlobalMeasurementProfileListResponse)
async def list_global_measurement_profiles(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    search: Annotated[str | None, Query(max_length=200)] = None,
    garment_type: Annotated[str | None, Query(max_length=80)] = None,
    archived: bool = False,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> GlobalMeasurementProfileListResponse:
    return await list_measurement_profiles(
        session, business, search, garment_type, archived, page, page_size
    )


@router.get("/measurement-templates", response_model=list[MeasurementTemplateListItem])
async def list_measurement_templates(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> list[MeasurementTemplateListItem]:
    return await list_templates(session, business)


@router.get("/measurement-templates/{template_id}", response_model=MeasurementTemplateResponse)
async def get_measurement_template(
    template_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> MeasurementTemplateResponse:
    return await get_template(session, business, template_id)


@router.get(
    "/customers/{customer_id}/measurements",
    response_model=MeasurementProfileListResponse,
)
async def list_customer_measurements(
    customer_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    archived: bool = False,
) -> MeasurementProfileListResponse:
    return await list_customer_measurement_profiles(
        session, business, customer_id, page, page_size, archived
    )


@router.post(
    "/customers/{customer_id}/measurements",
    response_model=MeasurementProfileResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_customer_measurement(
    customer_id: uuid.UUID,
    payload: MeasurementProfileCreate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> MeasurementProfileResponse:
    profile = await create_measurement_profile(
        session, business, current_user, customer_id, payload
    )
    return profile_response(profile)


@router.get("/measurement-profiles/{profile_id}", response_model=MeasurementProfileResponse)
async def get_measurement_profile_record(
    profile_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> MeasurementProfileResponse:
    profile = await get_measurement_profile(session, business, profile_id)
    return profile_response(profile)


@router.post(
    "/measurement-profiles/{profile_id}/archive", response_model=MeasurementProfileResponse
)
async def archive_measurement_profile_record(
    profile_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> MeasurementProfileResponse:
    profile = await archive_measurement_profile(session, business, profile_id)
    return profile_response(profile)


@router.post(
    "/measurement-profiles/{profile_id}/restore", response_model=MeasurementProfileResponse
)
async def restore_measurement_profile_record(
    profile_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> MeasurementProfileResponse:
    profile = await restore_measurement_profile(session, business, profile_id)
    return profile_response(profile)
