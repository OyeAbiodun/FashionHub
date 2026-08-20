import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_business
from app.core.database import get_db_session
from app.models.business import Business
from app.schemas.customer import (
    CustomerCreate,
    CustomerListResponse,
    CustomerResponse,
    CustomerUpdate,
)
from app.schemas.measurement import MeasurementProfilePublic
from app.schemas.order import OrderPublic
from app.services.customer_service import (
    archive_customer,
    create_customer,
    get_customer,
    list_customer_measurements,
    list_customer_orders,
    list_customers,
    restore_customer,
    update_customer,
)

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("", response_model=CustomerListResponse)
async def list_customer_records(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    search: Annotated[str | None, Query(max_length=200)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    archived: bool = False,
) -> CustomerListResponse:
    return await list_customers(session, business, search, page, page_size, archived)


@router.post("", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_customer_record(
    payload: CustomerCreate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> CustomerResponse:
    return await create_customer(session, business, payload)


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer_record(
    customer_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> CustomerResponse:
    return await get_customer(session, business, customer_id)


@router.get("/{customer_id}/measurements", response_model=list[MeasurementProfilePublic])
async def get_customer_measurements_record(
    customer_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> list[MeasurementProfilePublic]:
    return await list_customer_measurements(session, business, customer_id)


@router.get("/{customer_id}/orders", response_model=list[OrderPublic])
async def get_customer_orders_record(
    customer_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> list[OrderPublic]:
    return await list_customer_orders(session, business, customer_id)


@router.patch("/{customer_id}", response_model=CustomerResponse)
async def update_customer_record(
    customer_id: uuid.UUID,
    payload: CustomerUpdate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> CustomerResponse:
    return await update_customer(session, business, customer_id, payload)


@router.post("/{customer_id}/archive", response_model=CustomerResponse)
async def archive_customer_record(
    customer_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> CustomerResponse:
    return await archive_customer(session, business, customer_id)


@router.post("/{customer_id}/restore", response_model=CustomerResponse)
async def restore_customer_record(
    customer_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> CustomerResponse:
    return await restore_customer(session, business, customer_id)
