import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import create_token, hash_password, verify_password
from app.models.business import Business
from app.models.user import User, UserRole
from app.schemas.auth import LoginRequest, RegisterRequest

AUTH_ERROR = "Invalid email or password"


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    result = await session.execute(
        select(User).options(selectinload(User.business)).where(User.email == email.strip().lower())
    )
    return result.scalar_one_or_none()


async def get_user_by_id(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await session.execute(
        select(User).options(selectinload(User.business)).where(User.id == user_id)
    )
    return result.scalar_one_or_none()


async def register_owner(session: AsyncSession, payload: RegisterRequest) -> User:
    duplicate = await get_user_by_email(session, payload.user.email)
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email is already registered"
        )

    business = Business(
        name=payload.business.name.strip(),
        email=str(payload.business.email).lower() if payload.business.email else None,
        phone=payload.business.phone.strip(),
        address=payload.business.address.strip() if payload.business.address else None,
    )
    user = User(
        business=business,
        first_name=payload.user.first_name.strip(),
        last_name=payload.user.last_name.strip(),
        email=payload.user.email,
        phone=payload.user.phone.strip() if payload.user.phone else None,
        password_hash=hash_password(payload.user.password),
        role=UserRole.OWNER,
        is_active=True,
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email is already registered"
        ) from exc
    except Exception:
        await session.rollback()
        raise
    await session.refresh(user, attribute_names=["business"])
    return user


async def authenticate_user(session: AsyncSession, payload: LoginRequest) -> User:
    user = await get_user_by_email(session, payload.email)
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=AUTH_ERROR)
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=AUTH_ERROR)
    return user


def create_auth_tokens(user: User, settings) -> tuple[str, str]:
    subject = str(user.id)
    return (
        create_token(subject, settings=settings, token_kind="access"),
        create_token(subject, settings=settings, token_kind="refresh"),
    )
