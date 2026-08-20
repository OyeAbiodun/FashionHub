import uuid

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.role import Role
from app.schemas.role import RoleCreate, RolePublic, RoleUpdate


async def list_roles(session: AsyncSession, business: Business) -> list[RolePublic]:
    stmt = (
        select(Role)
        .where(
            or_(
                Role.business_id == business.id,
                Role.is_system_role.is_(True),
            )
        )
        .order_by(Role.is_system_role.desc(), Role.name.asc())
    )
    roles = (await session.execute(stmt)).scalars().all()
    return [RolePublic.model_validate(r) for r in roles]


async def create_custom_role(
    session: AsyncSession, business: Business, payload: RoleCreate
) -> RolePublic:
    # Check duplicate role name in business
    existing_stmt = select(Role).where(
        Role.business_id == business.id,
        Role.name.ilike(payload.name.strip()),
    )
    existing = (await session.execute(existing_stmt)).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A custom role with this name already exists in your workspace.",
        )

    role = Role(
        business_id=business.id,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        permissions=payload.permissions,
        is_system_role=False,
    )
    session.add(role)
    await session.commit()
    await session.refresh(role)
    return RolePublic.model_validate(role)


async def update_custom_role(
    session: AsyncSession, business: Business, role_id: uuid.UUID, payload: RoleUpdate
) -> RolePublic:
    stmt = select(Role).where(Role.id == role_id, Role.business_id == business.id)
    role = (await session.execute(stmt)).scalar_one_or_none()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom role not found or cannot edit system role.",
        )

    if payload.name is not None:
        role.name = payload.name.strip()
    if payload.description is not None:
        role.description = payload.description.strip() if payload.description else None
    if payload.permissions is not None:
        role.permissions = payload.permissions

    await session.commit()
    await session.refresh(role)
    return RolePublic.model_validate(role)


async def delete_custom_role(session: AsyncSession, business: Business, role_id: uuid.UUID) -> None:
    stmt = select(Role).where(Role.id == role_id, Role.business_id == business.id)
    role = (await session.execute(stmt)).scalar_one_or_none()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Custom role not found.",
        )

    await session.delete(role)
    await session.commit()
