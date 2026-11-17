from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.finance import PaymentStatus
from app.models.fulfillment import (
    FulfillmentEventType,
    FulfillmentMethod,
    FulfillmentStatus,
    OrderFulfillment,
    OrderFulfillmentEvent,
)
from app.models.order import OrderStatus
from app.models.order import Order
from app.models.user import User
from app.schemas.fulfillment import FulfillmentAction, FulfillmentUpdate
from app.schemas.order import OrderStatusUpdate
from app.services.order_service import get_order, update_order_status


async def lock_order(session: AsyncSession, business: Business, order_id: UUID) -> None:
    locked_id = (
        await session.execute(
            select(Order.id)
            .where(Order.id == order_id, Order.business_id == business.id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if locked_id is None:
        raise HTTPException(status_code=404, detail="Order not found")


async def update_fulfillment(
    session: AsyncSession,
    business: Business,
    actor: User,
    order_id: UUID,
    payload: FulfillmentUpdate,
):
    await lock_order(session, business, order_id)
    order = await get_order(session, business, order_id)
    if order.status in {OrderStatus.DELIVERED, OrderStatus.CANCELLED}:
        raise HTTPException(status_code=409, detail="Fulfillment cannot be changed for a closed order.")
    fulfillment = order.fulfillment
    if fulfillment is not None and fulfillment.status != FulfillmentStatus.PLANNED:
        raise HTTPException(status_code=409, detail="Fulfillment details are locked after dispatch.")

    if payload.delivery_charge is not None and payload.delivery_charge != order.delivery_charge:
        if not business.delivery_charges_enabled:
            raise HTTPException(status_code=409, detail="Delivery charges are disabled for this business.")
        if order.payment_plan is not None:
            raise HTTPException(
                status_code=409,
                detail="Delivery charges cannot change while an installment plan exists.",
            )
        if any(payment.status == PaymentStatus.SUCCESSFUL for payment in order.payments):
            raise HTTPException(
                status_code=409,
                detail="Set the delivery charge before recording payments.",
            )
        order.delivery_charge = payload.delivery_charge
    if payload.method == FulfillmentMethod.PICKUP and order.delivery_charge > 0:
        raise HTTPException(
            status_code=409,
            detail="Clear the delivery charge before changing this order to pickup.",
        )

    now = datetime.now(UTC)
    event_type = FulfillmentEventType.UPDATED
    if fulfillment is None:
        event_type = FulfillmentEventType.CONFIGURED
        fulfillment = OrderFulfillment(
            business_id=business.id,
            order_id=order.id,
            method=payload.method,
            status=FulfillmentStatus.PLANNED,
            created_by=actor.id,
            updated_by=actor.id,
        )
        session.add(fulfillment)
    fulfillment.method = payload.method
    fulfillment.recipient_name = payload.recipient_name
    fulfillment.recipient_phone = payload.recipient_phone
    fulfillment.delivery_address = payload.delivery_address
    fulfillment.delivery_instructions = payload.delivery_instructions
    fulfillment.tracking_reference = payload.tracking_reference
    fulfillment.updated_by = actor.id
    fulfillment.events.append(
        OrderFulfillmentEvent(
            event_type=event_type,
            actor_id=actor.id,
            notes="Fulfillment details saved.",
            occurred_at=now,
        )
    )
    await session.commit()
    return await get_order(session, business, order_id)


async def dispatch_fulfillment(
    session: AsyncSession,
    business: Business,
    actor: User,
    order_id: UUID,
    payload: FulfillmentAction,
):
    await lock_order(session, business, order_id)
    order = await get_order(session, business, order_id)
    fulfillment = order.fulfillment
    if order.status != OrderStatus.READY:
        raise HTTPException(status_code=409, detail="Only ready orders can be dispatched.")
    if fulfillment is None or fulfillment.method != FulfillmentMethod.DELIVERY:
        raise HTTPException(status_code=409, detail="Configure delivery fulfillment before dispatch.")
    if payload.proof_of_delivery_url is not None:
        raise HTTPException(status_code=422, detail="Proof of handoff is recorded when fulfillment is completed.")
    if fulfillment.status != FulfillmentStatus.PLANNED:
        raise HTTPException(status_code=409, detail="This delivery is already dispatched or complete.")
    now = datetime.now(UTC)
    fulfillment.status = FulfillmentStatus.OUT_FOR_DELIVERY
    fulfillment.dispatched_at = now
    fulfillment.updated_by = actor.id
    fulfillment.events.append(
        OrderFulfillmentEvent(
            event_type=FulfillmentEventType.DISPATCHED,
            actor_id=actor.id,
            notes=payload.notes or "Outfit dispatched for delivery.",
            occurred_at=now,
        )
    )
    await session.commit()
    return await get_order(session, business, order_id)


async def complete_fulfillment(
    session: AsyncSession,
    business: Business,
    actor: User,
    order_id: UUID,
    payload: FulfillmentAction,
):
    await lock_order(session, business, order_id)
    order = await get_order(session, business, order_id)
    fulfillment = order.fulfillment
    if order.status != OrderStatus.READY:
        raise HTTPException(status_code=409, detail="Only ready orders can be handed off.")
    if fulfillment is None:
        raise HTTPException(status_code=409, detail="Configure pickup or delivery before handoff.")
    if fulfillment.method == FulfillmentMethod.DELIVERY and not payload.proof_of_delivery_url:
        raise HTTPException(status_code=422, detail="Capture a proof photo before completing handoff.")
    if fulfillment.method == FulfillmentMethod.DELIVERY and fulfillment.status != FulfillmentStatus.OUT_FOR_DELIVERY:
        raise HTTPException(status_code=409, detail="Dispatch the delivery before recording handoff.")
    if fulfillment.method == FulfillmentMethod.PICKUP and fulfillment.status != FulfillmentStatus.PLANNED:
        raise HTTPException(status_code=409, detail="This pickup has already been completed.")

    now = datetime.now(UTC)
    fulfillment.status = FulfillmentStatus.COMPLETED
    fulfillment.completed_at = now
    fulfillment.proof_of_delivery_url = payload.proof_of_delivery_url if fulfillment.method == FulfillmentMethod.DELIVERY else None
    fulfillment.updated_by = actor.id
    fulfillment.events.append(
        OrderFulfillmentEvent(
            event_type=FulfillmentEventType.HANDED_OFF,
            actor_id=actor.id,
            notes=payload.notes or "Completed outfit handed off to the customer.",
            occurred_at=now,
        )
    )
    await session.flush()
    return await update_order_status(
        session,
        business,
        actor,
        order_id,
        OrderStatusUpdate(status=OrderStatus.DELIVERED, notes=payload.notes),
    )
