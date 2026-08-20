import math
import re
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import Select, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.customer import Customer
from app.schemas.customer import CustomerCreate, CustomerListResponse, CustomerUpdate

DUPLICATE_PHONE_ERROR = "A customer with this phone number already exists."


def normalize_phone(phone: str) -> str:
    """Strip whitespace and remove common visual separators: spaces, hyphens, dots, and brackets."""
    return re.sub(r"[\s\-().]", "", phone.strip())


async def _phone_exists(
    session: AsyncSession,
    business: Business,
    phone_normalized: str,
    exclude_customer_id: uuid.UUID | None = None,
) -> bool:
    query = select(Customer.id).where(
        Customer.business_id == business.id,
        Customer.phone_normalized == phone_normalized,
    )
    if exclude_customer_id is not None:
        query = query.where(Customer.id != exclude_customer_id)
    return (await session.execute(query.limit(1))).scalar_one_or_none() is not None


async def create_customer(
    session: AsyncSession,
    business: Business,
    payload: CustomerCreate,
) -> Customer:
    phone_normalized = normalize_phone(payload.phone)
    if await _phone_exists(session, business, phone_normalized):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DUPLICATE_PHONE_ERROR)

    customer = Customer(
        business_id=business.id,
        first_name=payload.first_name.strip(),
        last_name=payload.last_name,
        phone=payload.phone.strip(),
        phone_normalized=phone_normalized,
        alternate_phone=payload.alternate_phone.strip() if payload.alternate_phone else None,
        email=str(payload.email).lower() if payload.email else None,
        gender=payload.gender,
        birthday=payload.birthday,
        address=payload.address,
        notes=payload.notes,
    )
    session.add(customer)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=DUPLICATE_PHONE_ERROR
        ) from exc
    except Exception:
        await session.rollback()
        raise
    await session.refresh(customer)
    return customer


def _search_filter(query: Select[tuple[Customer]], search: str | None) -> Select[tuple[Customer]]:
    if not search:
        return query
    search_term = f"%{search.strip().lower()}%"
    phone_term = f"%{normalize_phone(search)}%"
    return query.where(
        or_(
            func.lower(Customer.first_name).like(search_term),
            func.lower(Customer.last_name).like(search_term),
            Customer.phone_normalized.like(phone_term),
            func.lower(Customer.email).like(search_term),
        )
    )


async def list_customers(
    session: AsyncSession,
    business: Business,
    search: str | None,
    page: int,
    page_size: int,
    archived: bool,
) -> CustomerListResponse:
    base_query = select(Customer).where(Customer.business_id == business.id)
    if archived:
        base_query = base_query.where(Customer.archived_at.is_not(None))
    else:
        base_query = base_query.where(Customer.archived_at.is_(None))
    base_query = _search_filter(base_query, search)

    total_query = select(func.count()).select_from(base_query.order_by(None).subquery())
    total = (await session.execute(total_query)).scalar_one()
    offset = (page - 1) * page_size
    result = await session.execute(
        base_query.order_by(Customer.created_at.desc()).offset(offset).limit(page_size)
    )
    items = result.scalars().all()
    return CustomerListResponse(
        items=list(items),
        page=page,
        page_size=page_size,
        total=total,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


async def get_customer(
    session: AsyncSession,
    business: Business,
    customer_id: uuid.UUID,
) -> Customer:
    result = await session.execute(
        select(Customer).where(Customer.business_id == business.id, Customer.id == customer_id)
    )
    customer = result.scalar_one_or_none()
    if customer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return customer


async def update_customer(
    session: AsyncSession,
    business: Business,
    customer_id: uuid.UUID,
    payload: CustomerUpdate,
) -> Customer:
    customer = await get_customer(session, business, customer_id)
    updates = payload.model_dump(exclude_unset=True)

    if "phone" in updates and updates["phone"] is not None:
        next_phone_normalized = normalize_phone(updates["phone"])
        if await _phone_exists(
            session, business, next_phone_normalized, exclude_customer_id=customer.id
        ):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=DUPLICATE_PHONE_ERROR)
        customer.phone = updates["phone"].strip()
        customer.phone_normalized = next_phone_normalized

    for field in (
        "first_name",
        "last_name",
        "alternate_phone",
        "email",
        "gender",
        "birthday",
        "address",
        "notes",
    ):
        if field in updates:
            value = updates[field]
            if field == "first_name" and value is not None:
                value = value.strip()
            if field == "email" and value is not None:
                value = str(value).lower()
            if field == "alternate_phone" and value is not None:
                value = value.strip()
            setattr(customer, field, value)

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=DUPLICATE_PHONE_ERROR
        ) from exc
    except Exception:
        await session.rollback()
        raise
    await session.refresh(customer)
    return customer


async def archive_customer(
    session: AsyncSession,
    business: Business,
    customer_id: uuid.UUID,
) -> Customer:
    customer = await get_customer(session, business, customer_id)
    if customer.archived_at is None:
        customer.archived_at = datetime.now(UTC)
        await session.commit()
        await session.refresh(customer)
    return customer


async def restore_customer(
    session: AsyncSession,
    business: Business,
    customer_id: uuid.UUID,
) -> Customer:
    customer = await get_customer(session, business, customer_id)
    if customer.archived_at is not None:
        customer.archived_at = None
        await session.commit()
        await session.refresh(customer)
    return customer


async def list_customer_measurements(
    session: AsyncSession, business: Business, customer_id: uuid.UUID
):
    from app.models.measurement import MeasurementProfile
    from app.services.measurement_service import _load_profile

    await get_customer(session, business, customer_id)
    stmt = (
        select(MeasurementProfile)
        .where(
            MeasurementProfile.business_id == business.id,
            MeasurementProfile.customer_id == customer_id,
        )
        .order_by(MeasurementProfile.created_at.desc())
    )
    result = await session.execute(stmt)
    profiles = result.scalars().all()
    return [await _load_profile(session, p) for p in profiles]


async def list_customer_orders(
    session: AsyncSession, business: Business, customer_id: uuid.UUID
):
    from app.models.order import Order
    from app.services.order_service import _load_order, order_to_response

    await get_customer(session, business, customer_id)
    stmt = (
        select(Order)
        .where(
            Order.business_id == business.id,
            Order.customer_id == customer_id,
        )
        .order_by(Order.created_at.desc())
    )
    result = await session.execute(stmt)
    orders = result.scalars().all()
    return [order_to_response(await _load_order(session, o.id)) for o in orders]
