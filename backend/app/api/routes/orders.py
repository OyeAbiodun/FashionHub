import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_business, get_current_user, require_feature_permission
from app.core.database import get_db_session
from app.models.business import Business
from app.models.order import OrderStatus
from app.models.user import User
from app.schemas.order import (
    OrderCreate,
    OrderDetailResponse,
    OrderListResponse,
    OrderStatusUpdate,
    OrderUpdate,
)
from app.services.order_service import (
    create_order,
    get_order,
    list_orders,
    order_response,
    update_order,
    update_order_status,
)

router = APIRouter(tags=["orders"])


@router.get(
    "/orders",
    response_model=OrderListResponse,
    dependencies=[Depends(require_feature_permission("orders", "orders:read"))],
)
async def list_order_records(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    search: Annotated[str | None, Query(max_length=200)] = None,
    status_filter: Annotated[list[OrderStatus] | None, Query(alias="status")] = None,
    due: Literal["today", "tomorrow", "this_week", "overdue", "upcoming"] | None = None,
    customer_id: uuid.UUID | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> OrderListResponse:
    return await list_orders(
        session, business, search, status_filter, due, customer_id, page, page_size
    )


@router.post(
    "/orders",
    response_model=OrderDetailResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_feature_permission("orders", "orders:write"))],
)
async def create_order_record(
    payload: OrderCreate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> OrderDetailResponse:
    order = await create_order(session, business, current_user, payload)
    return order_response(order, business)


@router.get(
    "/orders/{order_id}",
    response_model=OrderDetailResponse,
    dependencies=[Depends(require_feature_permission("orders", "orders:read"))],
)
async def get_order_record(
    order_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> OrderDetailResponse:
    order = await get_order(session, business, order_id)
    return order_response(order, business)


@router.patch(
    "/orders/{order_id}",
    response_model=OrderDetailResponse,
    dependencies=[Depends(require_feature_permission("orders", "orders:write"))],
)
async def update_order_record(
    order_id: uuid.UUID,
    payload: OrderUpdate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> OrderDetailResponse:
    order = await update_order(session, business, order_id, payload)
    return order_response(order, business)


@router.post(
    "/orders/{order_id}/status",
    response_model=OrderDetailResponse,
    dependencies=[Depends(require_feature_permission("orders", "orders:write"))],
)
async def update_order_status_record(
    order_id: uuid.UUID,
    payload: OrderStatusUpdate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> OrderDetailResponse:
    order = await update_order_status(session, business, current_user, order_id, payload)
    return order_response(order, business)


@router.get(
    "/customers/{customer_id}/orders",
    response_model=OrderListResponse,
    dependencies=[Depends(require_feature_permission("orders", "orders:read"))],
)
async def list_customer_order_records(
    customer_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 5,
) -> OrderListResponse:
    return await list_orders(session, business, None, None, None, customer_id, page, page_size)
