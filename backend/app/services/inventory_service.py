import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.business import Business
from app.models.inventory import (
    InventoryItem,
    OrderMaterialUsage,
    StockMovement,
    StockMovementType,
    Supplier,
)
from app.models.order import Order
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

ZERO = Decimal("0.000")


async def _stock_by_item(session: AsyncSession, business_id: uuid.UUID) -> dict[uuid.UUID, Decimal]:
    rows = await session.execute(
        select(StockMovement.item_id, func.coalesce(func.sum(StockMovement.quantity_delta), 0))
        .where(StockMovement.business_id == business_id)
        .group_by(StockMovement.item_id)
    )
    return {item_id: Decimal(value) for item_id, value in rows.all()}


def _item_public(item: InventoryItem, stock: Decimal) -> InventoryItemPublic:
    return InventoryItemPublic(
        id=item.id,
        name=item.name,
        sku=item.sku,
        unit=item.unit,
        reorder_level=item.reorder_level,
        supplier_id=item.supplier_id,
        supplier_name=item.supplier.name if item.supplier else None,
        description=item.description,
        is_active=item.is_active,
        current_stock=stock,
        is_low_stock=item.is_active and stock <= item.reorder_level,
        created_at=item.created_at,
    )


async def list_items(
    session: AsyncSession,
    business: Business,
    search: str | None = None,
    low_stock_only: bool = False,
) -> InventoryListResponse:
    stmt = (
        select(InventoryItem)
        .options(selectinload(InventoryItem.supplier))
        .where(InventoryItem.business_id == business.id, InventoryItem.is_active.is_(True))
    )
    if search and search.strip():
        term = f"%{search.strip()}%"
        stmt = stmt.where((InventoryItem.name.ilike(term)) | (InventoryItem.sku.ilike(term)))
    items = (await session.execute(stmt.order_by(InventoryItem.name))).scalars().all()
    stocks = await _stock_by_item(session, business.id)
    payload = [_item_public(item, stocks.get(item.id, ZERO)) for item in items]
    if low_stock_only:
        payload = [item for item in payload if item.is_low_stock]
    return InventoryListResponse(items=payload, total=len(payload))


async def create_item(
    session: AsyncSession, business: Business, payload: InventoryItemWrite
) -> InventoryItemPublic:
    supplier = None
    if payload.supplier_id:
        supplier = await session.scalar(
            select(Supplier).where(
                Supplier.id == payload.supplier_id,
                Supplier.business_id == business.id,
                Supplier.archived_at.is_(None),
            )
        )
        if supplier is None:
            raise HTTPException(status_code=404, detail="Supplier not found")
    item = InventoryItem(
        business_id=business.id,
        supplier_id=payload.supplier_id,
        supplier=supplier,
        name=payload.name.strip(),
        sku=payload.sku.strip() if payload.sku else None,
        unit=payload.unit.strip(),
        reorder_level=payload.reorder_level,
        description=payload.description,
        is_active=payload.is_active,
    )
    session.add(item)
    await session.commit()
    item = await session.scalar(
        select(InventoryItem)
        .options(selectinload(InventoryItem.supplier))
        .where(InventoryItem.id == item.id, InventoryItem.business_id == business.id)
    )
    return _item_public(item, ZERO)


async def update_item(
    session: AsyncSession, business: Business, item_id: uuid.UUID, payload: InventoryItemWrite
) -> InventoryItemPublic:
    item = await session.scalar(
        select(InventoryItem)
        .options(selectinload(InventoryItem.supplier))
        .where(InventoryItem.id == item_id, InventoryItem.business_id == business.id)
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    if payload.supplier_id:
        supplier_id = await session.scalar(
            select(Supplier.id).where(
                Supplier.id == payload.supplier_id,
                Supplier.business_id == business.id,
                Supplier.archived_at.is_(None),
            )
        )
        if supplier_id is None:
            raise HTTPException(status_code=404, detail="Supplier not found")
    item.name = payload.name.strip()
    item.sku = payload.sku.strip() if payload.sku else None
    item.unit = payload.unit.strip()
    item.reorder_level = payload.reorder_level
    item.supplier_id = payload.supplier_id
    item.description = payload.description
    item.is_active = payload.is_active
    await session.commit()
    await session.refresh(item)
    item = await session.scalar(
        select(InventoryItem)
        .options(selectinload(InventoryItem.supplier))
        .where(InventoryItem.id == item_id, InventoryItem.business_id == business.id)
    )
    stock = await session.scalar(
        select(func.coalesce(func.sum(StockMovement.quantity_delta), 0)).where(
            StockMovement.item_id == item.id, StockMovement.business_id == business.id
        )
    )
    return _item_public(item, Decimal(stock or 0))


async def list_suppliers(session: AsyncSession, business: Business) -> list[SupplierPublic]:
    rows = (
        (
            await session.execute(
                select(Supplier)
                .where(Supplier.business_id == business.id, Supplier.archived_at.is_(None))
                .order_by(Supplier.name)
            )
        )
        .scalars()
        .all()
    )
    return [SupplierPublic.model_validate(row) for row in rows]


async def save_supplier(
    session: AsyncSession,
    business: Business,
    payload: SupplierWrite,
    supplier_id: uuid.UUID | None = None,
) -> SupplierPublic:
    supplier = None
    if supplier_id:
        supplier = await session.scalar(
            select(Supplier).where(
                Supplier.id == supplier_id,
                Supplier.business_id == business.id,
                Supplier.archived_at.is_(None),
            )
        )
        if supplier is None:
            raise HTTPException(status_code=404, detail="Supplier not found")
    else:
        supplier = Supplier(business_id=business.id)
        session.add(supplier)
    for key, value in payload.model_dump().items():
        setattr(supplier, key, value.strip() if isinstance(value, str) else value)
    await session.commit()
    await session.refresh(supplier)
    return SupplierPublic.model_validate(supplier)


async def archive_supplier(
    session: AsyncSession, business: Business, supplier_id: uuid.UUID
) -> None:
    supplier = await session.scalar(
        select(Supplier).where(
            Supplier.id == supplier_id,
            Supplier.business_id == business.id,
            Supplier.archived_at.is_(None),
        )
    )
    if supplier is None:
        raise HTTPException(status_code=404, detail="Supplier not found")
    supplier.archived_at = datetime.now(UTC)
    await session.commit()


async def _locked_item(
    session: AsyncSession, business_id: uuid.UUID, item_id: uuid.UUID
) -> InventoryItem:
    item = await session.scalar(
        select(InventoryItem)
        .where(
            InventoryItem.id == item_id,
            InventoryItem.business_id == business_id,
            InventoryItem.is_active.is_(True),
        )
        .with_for_update()
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    return item


async def _stock(session: AsyncSession, business_id: uuid.UUID, item_id: uuid.UUID) -> Decimal:
    value = await session.scalar(
        select(func.coalesce(func.sum(StockMovement.quantity_delta), 0)).where(
            StockMovement.item_id == item_id, StockMovement.business_id == business_id
        )
    )
    return Decimal(value or 0)


def _movement_public(row: StockMovement) -> StockMovementPublic:
    name = " ".join(part for part in (row.created_by.first_name, row.created_by.last_name) if part)
    return StockMovementPublic(
        id=row.id,
        item_id=row.item_id,
        item_name=row.item.name,
        order_id=row.order_id,
        movement_type=row.movement_type,
        quantity_delta=row.quantity_delta,
        unit_cost=row.unit_cost,
        reason=row.reason,
        created_by_name=name,
        created_at=row.created_at,
    )


async def record_movement(
    session: AsyncSession,
    business: Business,
    actor: User,
    item_id: uuid.UUID,
    payload: StockMovementCreate,
) -> InventoryItemPublic:
    item = await _locked_item(session, business.id, item_id)
    current = await _stock(session, business.id, item.id)
    if payload.movement_type == StockMovementType.RECEIPT:
        delta = payload.quantity
    else:
        # Positive values add stock; negative adjustments are entered as a negative signed quantity.
        delta = payload.quantity
        if current + delta < ZERO:
            raise HTTPException(status_code=409, detail="Adjustment would make stock negative")
    movement = StockMovement(
        business_id=business.id,
        item_id=item.id,
        movement_type=payload.movement_type,
        quantity_delta=delta,
        unit_cost=payload.unit_cost,
        reason=payload.reason.strip(),
        created_by_id=actor.id,
        created_at=datetime.now(UTC),
    )
    session.add(movement)
    await session.commit()
    item = await session.scalar(
        select(InventoryItem)
        .options(selectinload(InventoryItem.supplier))
        .where(InventoryItem.id == item.id)
    )
    return _item_public(item, current + delta)


async def list_movements(
    session: AsyncSession, business: Business, item_id: uuid.UUID
) -> list[StockMovementPublic]:
    item = await session.scalar(
        select(InventoryItem.id).where(
            InventoryItem.id == item_id, InventoryItem.business_id == business.id
        )
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    rows = (
        (
            await session.execute(
                select(StockMovement)
                .options(selectinload(StockMovement.item), selectinload(StockMovement.created_by))
                .where(StockMovement.item_id == item_id, StockMovement.business_id == business.id)
                .order_by(StockMovement.created_at.desc())
                .limit(100)
            )
        )
        .scalars()
        .all()
    )
    return [_movement_public(row) for row in rows]


async def consume_for_order(
    session: AsyncSession,
    business: Business,
    actor: User,
    order_id: uuid.UUID,
    payload: MaterialUsageCreate,
) -> MaterialUsagePublic:
    order = await session.scalar(
        select(Order).where(Order.id == order_id, Order.business_id == business.id)
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status.value in {"DELIVERED", "CANCELLED"}:
        raise HTTPException(
            status_code=409,
            detail="Materials cannot be recorded for a delivered or cancelled order",
        )
    item = await _locked_item(session, business.id, payload.item_id)
    current = await _stock(session, business.id, item.id)
    if payload.quantity > current:
        raise HTTPException(
            status_code=409, detail=f"Insufficient stock. Available: {current} {item.unit}"
        )
    usage = OrderMaterialUsage(
        business_id=business.id,
        order_id=order_id,
        item_id=item.id,
        quantity=payload.quantity,
        notes=payload.notes,
        created_by_id=actor.id,
    )
    session.add(usage)
    await session.flush()
    movement_reason = "Used for order material allocation"
    if payload.notes:
        movement_reason = f"{movement_reason}: {payload.notes.strip()}"
    session.add(
        StockMovement(
            business_id=business.id,
            item_id=item.id,
            order_id=order_id,
            usage_id=usage.id,
            movement_type=StockMovementType.CONSUMPTION,
            quantity_delta=-payload.quantity,
            reason=movement_reason,
            created_by_id=actor.id,
            created_at=datetime.now(UTC),
        )
    )
    await session.commit()
    name = " ".join(part for part in (actor.first_name, actor.last_name) if part)
    return MaterialUsagePublic(
        id=usage.id,
        order_id=order_id,
        item_id=item.id,
        item_name=item.name,
        unit=item.unit,
        quantity=usage.quantity,
        notes=usage.notes,
        created_by_name=name,
        created_at=usage.created_at,
    )


async def list_order_materials(
    session: AsyncSession, business: Business, order_id: uuid.UUID
) -> list[MaterialUsagePublic]:
    order = await session.scalar(
        select(Order.id).where(Order.id == order_id, Order.business_id == business.id)
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    rows = (
        (
            await session.execute(
                select(OrderMaterialUsage)
                .options(
                    selectinload(OrderMaterialUsage.item),
                    selectinload(OrderMaterialUsage.order),
                    selectinload(OrderMaterialUsage.created_by),
                )
                .where(
                    OrderMaterialUsage.business_id == business.id,
                    OrderMaterialUsage.order_id == order_id,
                )
                .order_by(OrderMaterialUsage.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    result = []
    for row in rows:
        name = " ".join(
            part for part in (row.created_by.first_name, row.created_by.last_name) if part
        )
        result.append(
            MaterialUsagePublic(
                id=row.id,
                order_id=order_id,
                item_id=row.item_id,
                item_name=row.item.name,
                unit=row.item.unit,
                quantity=row.quantity,
                notes=row.notes,
                created_by_name=name,
                created_at=row.created_at,
            )
        )
    return result
