import logging
import uuid
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from hmac import digest
from secrets import token_urlsafe
from urllib.parse import urlencode

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import create_token, hash_password, verify_password
from app.models.business import Business
from app.models.membership import BusinessMembership
from app.models.password_reset import PasswordResetToken
from app.models.password_reset_request import PasswordResetRequest
from app.models.user import User, UserRole
from app.schemas.auth import LoginRequest, RegisterRequest
from app.schemas.user import ChangePasswordRequest, UserUpdate
from app.services.email_service import (
    EmailDeliveryError,
    TransactionalEmail,
    get_configured_email_provider,
)
from app.services.measurement_service import seed_default_templates_for_business

AUTH_ERROR = "Invalid email or password"
logger = logging.getLogger(__name__)


async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
    result = await session.execute(
        select(User)
        .options(selectinload(User.business), selectinload(User.custom_role))
        .where(User.email == email.strip().lower())
    )
    return result.scalar_one_or_none()


async def get_user_by_id(session: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await session.execute(
        select(User)
        .options(selectinload(User.business), selectinload(User.custom_role))
        .where(User.id == user_id)
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
        await session.flush()
        session.add(
            BusinessMembership(
                business_id=business.id,
                user_id=user.id,
                role=UserRole.OWNER.value,
                is_active=True,
            )
        )
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
    if not user.is_active or not user.business.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=AUTH_ERROR)
    return user


def create_auth_tokens(user: User, settings) -> tuple[str, str]:
    subject = str(user.id)
    return (
        create_token(subject, settings=settings, token_kind="access"),
        create_token(subject, settings=settings, token_kind="refresh"),
    )


async def request_password_reset(
    session: AsyncSession, email: str, settings, source: str = "unknown"
) -> str:
    generic_msg = (
        "If an account exists with this email, password reset instructions have been generated."
    )
    if not await _record_reset_request_if_allowed(session, email, source, settings):
        return generic_msg

    user = await get_user_by_email(session, email)
    if user is None or not user.is_active or not user.business.is_active:
        return generic_msg
    try:
        email_provider = await get_configured_email_provider(session, settings)
    except EmailDeliveryError:
        logger.error("Password reset email delivery is unavailable due to platform configuration.")
        return generic_msg
    if email_provider is None:
        logger.error("Password reset email delivery is unavailable because it is not configured.")
        return generic_msg
    raw_token = token_urlsafe(32)
    await session.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
    session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=_hash_reset_token(raw_token),
            expires_at=datetime.now(UTC) + timedelta(minutes=15),
        )
    )
    await session.commit()
    message = build_password_reset_email(user, raw_token, settings)
    try:
        await email_provider.send(message)
    except EmailDeliveryError:
        # Do not retain a credential that was never delivered and do not expose provider details.
        logger.error("Password reset email delivery failed.")
        await session.execute(
            delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
        )
        await session.commit()
        return generic_msg
    return generic_msg


async def reset_password_with_token(
    session: AsyncSession, token: str, new_password: str, settings
) -> None:
    now = datetime.now(UTC)
    reset_record = (
        await session.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.token_hash == _hash_reset_token(token),
                PasswordResetToken.used_at.is_(None),
                PasswordResetToken.expires_at > now,
            )
        )
    ).scalar_one_or_none()
    if reset_record is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token.",
        )
    user = await get_user_by_id(session, reset_record.user_id)
    if user is None or not user.is_active or not user.business.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token.",
        )
    user.password_hash = hash_password(new_password)
    reset_record.used_at = now
    await session.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
    await session.commit()


def _hash_reset_token(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


async def _record_reset_request_if_allowed(
    session: AsyncSession, email: str, source: str, settings
) -> bool:
    now = datetime.now(UTC)
    window_start = now - timedelta(minutes=settings.password_reset_rate_limit_window_minutes)
    identity_hash = _hash_reset_request_value(email.strip().lower(), settings)
    source_hash = _hash_reset_request_value(source, settings)
    await session.execute(
        delete(PasswordResetRequest).where(PasswordResetRequest.requested_at < window_start)
    )
    identity_count = (
        await session.execute(
            select(func.count()).select_from(PasswordResetRequest).where(
                PasswordResetRequest.identity_hash == identity_hash,
                PasswordResetRequest.requested_at >= window_start,
            )
        )
    ).scalar_one()
    source_count = (
        await session.execute(
            select(func.count()).select_from(PasswordResetRequest).where(
                PasswordResetRequest.source_hash == source_hash,
                PasswordResetRequest.requested_at >= window_start,
            )
        )
    ).scalar_one()
    if (
        identity_count >= settings.password_reset_rate_limit_count
        or source_count >= settings.password_reset_ip_rate_limit_count
    ):
        await session.commit()
        return False
    session.add(
        PasswordResetRequest(
            identity_hash=identity_hash,
            source_hash=source_hash,
            requested_at=now,
        )
    )
    await session.commit()
    return True


def _hash_reset_request_value(value: str, settings) -> str:
    return digest(settings.jwt_secret_key.encode("utf-8"), value.encode("utf-8"), "sha256").hex()


def build_password_reset_email(user: User, raw_token: str, settings) -> TransactionalEmail:
    from html import escape

    reset_url = f"{settings.frontend_origin}/reset-password?{urlencode({'token': raw_token})}"
    first_name = escape(user.first_name) if user.first_name else "there"
    subject = "FashionOS Password Reset"
    text = (
        "FashionOS Password Reset\n\n"
        f"Hello {user.first_name or 'there'},\n\n"
        "We received a request to reset your FashionOS password. "
        f"Use this link within 15 minutes:\n{reset_url}\n\n"
        "If you did not request this, you can safely ignore this email.\n\n"
        "FashionOS"
    )
    html = (
        '<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1f2937;">'
        '<div style="max-width:560px;margin:0 auto;padding:24px;">'
        '<h1 style="font-size:22px;">FashionOS Password Reset</h1>'
        f"<p>Hello {first_name},</p>"
        "<p>We received a request to reset your FashionOS password.</p>"
        f'<p><a href="{escape(reset_url, quote=True)}" '
        'style="display:inline-block;padding:12px 18px;background:#047857;color:#fff;'
        'text-decoration:none;border-radius:6px;">Reset password</a></p>'
        "<p>This link expires in 15 minutes and can be used once.</p>"
        "<p>If you did not request this, you can safely ignore this email.</p>"
        '<hr style="border:0;border-top:1px solid #e5e7eb;"><p style="font-size:12px;">'
        "FashionOS</p></div></body></html>"
    )
    return TransactionalEmail(to=user.email, subject=subject, text=text, html=html)


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
