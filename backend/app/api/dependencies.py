import uuid
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db_session
from app.core.permissions import PRIVILEGED_TENANT_ROLES, effective_permissions
from app.core.security import ACCESS_COOKIE_NAME, decode_token
from app.models.business import Business
from app.models.user import User, UserRole
from app.services.auth_service import get_user_by_id


async def get_current_user(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    access_token: Annotated[str | None, Cookie(alias=ACCESS_COOKIE_NAME)] = None,
) -> User:
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        )
    subject = decode_token(access_token, settings=settings, expected_kind="access")
    if subject is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        )
    try:
        user_id = uuid.UUID(subject)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        ) from exc
    user = await get_user_by_id(session, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        )
    if user.role != UserRole.SUPER_ADMIN and not user.business.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        )
    return user


async def get_current_business(
    current_user: Annotated[User, Depends(get_current_user)],
) -> Business:
    return current_user.business


def tenant_filter(model, current_user: User):
    """Apply this to future tenant-owned SELECTs: where(tenant_filter(Model, current_user))."""
    return model.business_id == current_user.business_id


async def get_current_super_admin(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admin privilege required.",
        )
    return current_user


def require_permission(required_permission: str):
    async def permission_checker(
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        if required_permission not in effective_permissions(current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission '{required_permission}' required.",
            )
        return current_user

    return permission_checker


def require_feature(feature: str):
    async def feature_checker(
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        if current_user.role == UserRole.SUPER_ADMIN:
            return current_user
        if feature not in (current_user.business.enabled_features or []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Feature '{feature}' is not enabled for this business.",
            )
        return current_user

    return feature_checker


def require_feature_permission(feature: str, required_permission: str):
    async def access_checker(
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        if current_user.role != UserRole.SUPER_ADMIN:
            if feature not in (current_user.business.enabled_features or []):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Feature '{feature}' is not enabled for this business.",
                )
            if required_permission not in effective_permissions(current_user):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permission '{required_permission}' required.",
                )
        return current_user

    return access_checker


async def require_tenant_admin(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    if current_user.role == UserRole.SUPER_ADMIN or current_user.role in PRIVILEGED_TENANT_ROLES:
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Tenant admin privilege required.",
    )
