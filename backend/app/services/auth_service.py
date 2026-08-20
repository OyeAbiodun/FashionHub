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
from app.schemas.user import ChangePasswordRequest, UserUpdate
from app.services.measurement_service import seed_default_templates_for_business

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
    seed_default_templates_for_business(business)
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


async def request_password_reset(
    session: AsyncSession, email: str, settings
) -> tuple[str, str | None]:
    user = await get_user_by_email(session, email)
    generic_msg = (
        "If an account exists with this email, password reset instructions have been generated."
    )
    if user is None or not user.is_active:
        return generic_msg, None
    reset_token = create_token(str(user.id), settings=settings, token_kind="password_reset")
    return generic_msg, reset_token


async def reset_password_with_token(
    session: AsyncSession, token: str, new_password: str, settings
) -> None:
    from app.core.security import decode_token

    subject = decode_token(token, settings=settings, expected_kind="password_reset")
    if subject is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token.",
        )
    try:
        user_id = uuid.UUID(subject)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token.",
        ) from exc
    user = await get_user_by_id(session, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token.",
        )
    user.password_hash = hash_password(new_password)
    await session.commit()


async def update_user_profile(
    session: AsyncSession, user: User, payload: UserUpdate
) -> User:
    if payload.first_name is not None:
        user.first_name = payload.first_name.strip()
    if payload.last_name is not None:
        user.last_name = payload.last_name.strip()
    if payload.phone is not None:
        user.phone = payload.phone.strip() if payload.phone.strip() else None
    await session.commit()
    await session.refresh(user, attribute_names=["business"])
    return user


async def change_user_password(
    session: AsyncSession, user: User, payload: ChangePasswordRequest
) -> None:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password.",
        )
    user.password_hash = hash_password(payload.new_password)
    await session.commit()


