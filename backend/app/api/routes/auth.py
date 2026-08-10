import uuid
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core.config import Settings, get_settings
from app.core.database import get_db_session
from app.core.security import (
    REFRESH_COOKIE_NAME,
    clear_auth_cookies,
    decode_token,
    set_auth_cookies,
)
from app.models.user import User
from app.schemas.auth import AuthSession, LoginRequest, MessageResponse, RegisterRequest
from app.services.auth_service import (
    authenticate_user,
    create_auth_tokens,
    get_user_by_id,
    register_owner,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def session_payload(user: User) -> AuthSession:
    return AuthSession.model_validate({"user": user, "business": user.business})


@router.post("/register", response_model=AuthSession, status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterRequest,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthSession:
    user = await register_owner(session, payload)
    access_token, refresh_token = create_auth_tokens(user, settings)
    set_auth_cookies(response, access_token, refresh_token, settings)
    return session_payload(user)


@router.post("/login", response_model=AuthSession)
async def login(
    payload: LoginRequest,
    response: Response,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthSession:
    user = await authenticate_user(session, payload)
    access_token, refresh_token = create_auth_tokens(user, settings)
    set_auth_cookies(response, access_token, refresh_token, settings)
    return session_payload(user)


@router.post("/refresh", response_model=AuthSession)
async def refresh(
    response: Response,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)] = None,
) -> AuthSession:
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        )
    subject = decode_token(refresh_token, settings=settings, expected_kind="refresh")
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
    access_token, next_refresh_token = create_auth_tokens(user, settings)
    set_auth_cookies(response, access_token, next_refresh_token, settings)
    return session_payload(user)


@router.post("/logout", response_model=MessageResponse)
async def logout(
    response: Response,
    settings: Annotated[Settings, Depends(get_settings)],
) -> MessageResponse:
    clear_auth_cookies(response, settings)
    return MessageResponse(message="Logged out")


@router.get("/me", response_model=AuthSession)
async def me(current_user: Annotated[User, Depends(get_current_user)]) -> AuthSession:
    return session_payload(current_user)
