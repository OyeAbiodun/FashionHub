import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.business import Business
from app.models.user import User
from app.schemas.team import StaffCreate, StaffPublic, StaffUpdate


async def list_team_members(session: AsyncSession, business: Business) -> list[StaffPublic]:
    stmt = (
        select(User)
        .where(User.business_id == business.id)
        .order_by(User.created_at.asc())
    )
    users = (await session.execute(stmt)).scalars().all()
    return [StaffPublic.model_validate(u) for u in users]


async def create_staff_member(
    session: AsyncSession, business: Business, payload: StaffCreate
) -> StaffPublic:
    # Check max_staff_users limit
    count_stmt = select(func.count(User.id)).where(User.business_id == business.id)
    current_count = (await session.execute(count_stmt)).scalar_one_or_none() or 0
    if current_count >= business.max_staff_users:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Staff account limit reached ({business.max_staff_users} max allowed). "
                "Contact Super Admin to upgrade."
            ),
        )

    # Check email uniqueness
    existing_stmt = select(User).where(User.email == payload.email.strip().lower())
    existing = (await session.execute(existing_stmt)).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists.",
        )

    user = User(
        business_id=business.id,
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        email=payload.email.strip().lower(),
        phone=payload.phone.strip() if payload.phone else None,
        password_hash=hash_password(payload.password),
        role=payload.role,
        permissions=payload.permissions,
        is_active=True,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return StaffPublic.model_validate(user)


async def update_staff_member(
    session: AsyncSession, business: Business, user_id: uuid.UUID, payload: StaffUpdate
) -> StaffPublic:
    stmt = select(User).where(User.id == user_id, User.business_id == business.id)
    user = (await session.execute(stmt)).scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found"
        )

    if payload.first_name is not None:
        user.first_name = payload.first_name.strip()
    if payload.last_name is not None:
        user.last_name = payload.last_name.strip()
    if payload.phone is not None:
        user.phone = payload.phone.strip() if payload.phone else None
    if payload.role is not None:
        user.role = payload.role
    if payload.permissions is not None:
        user.permissions = payload.permissions
    if payload.is_active is not None:
        user.is_active = payload.is_active

    await session.commit()
    await session.refresh(user)
    return StaffPublic.model_validate(user)
