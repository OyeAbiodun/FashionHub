from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt
from fastapi import Response
from pwdlib import PasswordHash

from app.core.config import Settings

password_hasher = PasswordHash.recommended()

ACCESS_COOKIE_NAME = "fashionos_access_token"
REFRESH_COOKIE_NAME = "fashionos_refresh_token"
TokenKind = Literal["access", "refresh"]


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)


def create_token(subject: str, settings: Settings, token_kind: TokenKind) -> str:
    now = datetime.now(UTC)
    if token_kind == "access":
        expires_at = now + timedelta(minutes=settings.access_token_expire_minutes)
    else:
        expires_at = now + timedelta(days=settings.refresh_token_expire_days)

    payload: dict[str, Any] = {"sub": subject, "type": token_kind, "iat": now, "exp": expires_at}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str, settings: Settings, expected_kind: TokenKind) -> str | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != expected_kind:
        return None
    subject = payload.get("sub")
    return subject if isinstance(subject, str) else None


def set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    settings: Settings,
) -> None:
    cookie_options = {
        "httponly": True,
        "secure": settings.cookie_secure,
        "samesite": settings.cookie_samesite,
        "path": "/",
    }
    response.set_cookie(
        ACCESS_COOKIE_NAME,
        access_token,
        max_age=settings.access_token_expire_minutes * 60,
        **cookie_options,
    )
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        refresh_token,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        **cookie_options,
    )


def clear_auth_cookies(response: Response, settings: Settings) -> None:
    for name in (ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME):
        response.delete_cookie(
            name,
            path="/",
            httponly=True,
            secure=settings.cookie_secure,
            samesite=settings.cookie_samesite,
        )
