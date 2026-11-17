import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_business, get_current_user, require_feature_permission
from app.core.database import get_db_session
from app.models.business import Business
from app.models.user import User
from app.schemas.inventory import (
    InventoryItemPublic,
    InventoryItemWrite,
    InventoryListResponse,
    MaterialUsageCreate,
    MaterialUsagePublic,
    StockMovementCreate,
    StockMovementPublic,
    SupplierPublic,
    SupplierWrite,
)
from app.services.inventory_service import (
    archive_supplier,
    consume_for_order,
    create_item,
    list_items,
    list_movements,
    list_order_materials,
    list_suppliers,
    record_movement,
    save_supplier,
    update_item,
)

router = APIRouter(
    prefix="/inventory",
    tags=["inventory"],
    dependencies=[Depends(require_feature_permission("inventory", "inventory:read"))],
)


@router.get("/items", response_model=InventoryListResponse)
async def get_items(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    search: Annotated[str | None, Query(max_length=100)] = None,
    low_stock_only: bool = False,
) -> InventoryListResponse:
    return await list_items(session, business, search, low_stock_only)


@router.post(
    "/items",
    response_model=InventoryItemPublic,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_feature_permission("inventory", "inventory:write"))],
)
async def add_item(
    payload: InventoryItemWrite,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> InventoryItemPublic:
    return await create_item(session, business, payload)


@router.put(
    "/items/{item_id}",
    response_model=InventoryItemPublic,
    dependencies=[Depends(require_feature_permission("inventory", "inventory:write"))],
)
async def edit_item(
    item_id: uuid.UUID,
    payload: InventoryItemWrite,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> InventoryItemPublic:
    return await update_item(session, business, item_id, payload)


@router.get("/items/{item_id}/movements", response_model=list[StockMovementPublic])
async def get_movements(
    item_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> list[StockMovementPublic]:
    return await list_movements(session, business, item_id)


@router.post(
    "/items/{item_id}/movements",
    response_model=InventoryItemPublic,
    dependencies=[Depends(require_feature_permission("inventory", "inventory:write"))],
)
async def add_movement(
    item_id: uuid.UUID,
    payload: StockMovementCreate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    actor: Annotated[User, Depends(get_current_user)],
) -> InventoryItemPublic:
    return await record_movement(session, business, actor, item_id, payload)


@router.get("/suppliers", response_model=list[SupplierPublic])
async def get_suppliers(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> list[SupplierPublic]:
    return await list_suppliers(session, business)


@router.post(
    "/suppliers",
    response_model=SupplierPublic,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_feature_permission("inventory", "inventory:write"))],
)
async def add_supplier(
    payload: SupplierWrite,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> SupplierPublic:
    return await save_supplier(session, business, payload)


@router.put(
    "/suppliers/{supplier_id}",
    response_model=SupplierPublic,
    dependencies=[Depends(require_feature_permission("inventory", "inventory:write"))],
)
async def edit_supplier(
    supplier_id: uuid.UUID,
    payload: SupplierWrite,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> SupplierPublic:
    return await save_supplier(session, business, payload, supplier_id)


@router.delete(
    "/suppliers/{supplier_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_feature_permission("inventory", "inventory:write"))],
)
async def remove_supplier(
    supplier_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> None:
    await archive_supplier(session, business, supplier_id)


@router.get("/orders/{order_id}/materials", response_model=list[MaterialUsagePublic])
async def get_order_materials(
    order_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> list[MaterialUsagePublic]:
    return await list_order_materials(session, business, order_id)


@router.post(
    "/orders/{order_id}/materials",
    response_model=MaterialUsagePublic,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_feature_permission("inventory", "inventory:write"))],
)
async def use_order_material(
    order_id: uuid.UUID,
    payload: MaterialUsageCreate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    actor: Annotated[User, Depends(get_current_user)],
) -> MaterialUsagePublic:
    return await consume_for_order(session, business, actor, order_id, payload)
