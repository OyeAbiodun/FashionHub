from functools import lru_cache
from typing import Literal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import AnyUrl, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = Field(default="FashionOS", alias="APP_NAME")
    app_env: str = Field(default="development", alias="APP_ENV")
    debug: bool = Field(default=True, alias="DEBUG")
    api_prefix: str = Field(default="/api/v1", alias="API_PREFIX")
    frontend_url: AnyUrl = Field(default="http://127.0.0.1:5173", alias="FRONTEND_URL")
    database_url: str = Field(
        default="postgresql+asyncpg://fashionos:fashionos@localhost:5432/fashionos",
        alias="DATABASE_URL",
    )
    jwt_secret_key: str = Field(alias="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(default=15, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_days: int = Field(default=14, alias="REFRESH_TOKEN_EXPIRE_DAYS")
    cookie_secure: bool = Field(default=False, alias="COOKIE_SECURE")
    cookie_samesite: Literal["lax", "strict", "none"] = Field(
        default="lax", alias="COOKIE_SAMESITE"
    )
    email_provider: Literal["capture", "resend"] = Field(default="capture", alias="EMAIL_PROVIDER")
    email_api_key: str | None = Field(default=None, alias="EMAIL_API_KEY")
    email_from_address: str = Field(
        default="no-reply@fashionos.example", alias="EMAIL_FROM_ADDRESS"
    )
    email_from_name: str = Field(default="FashionOS", alias="EMAIL_FROM_NAME")
    email_timeout_seconds: int = Field(default=10, ge=1, le=60, alias="EMAIL_TIMEOUT_SECONDS")
    password_reset_rate_limit_count: int = Field(
        default=3, ge=1, le=20, alias="PASSWORD_RESET_RATE_LIMIT_COUNT"
    )
    password_reset_rate_limit_window_minutes: int = Field(
        default=15, ge=1, le=60, alias="PASSWORD_RESET_RATE_LIMIT_WINDOW_MINUTES"
    )
    password_reset_ip_rate_limit_count: int = Field(
        default=10, ge=1, le=100, alias="PASSWORD_RESET_IP_RATE_LIMIT_COUNT"
    )

    @field_validator("jwt_secret_key")
    @classmethod
    def jwt_secret_must_be_set(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("JWT_SECRET_KEY must be set")
        return value

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_managed_postgres_url(cls, value: object) -> object:
        """Adapt common managed-PostgreSQL URLs for SQLAlchemy's asyncpg driver."""
        if not isinstance(value, str):
            return value

        normalized = value.strip()
        if normalized.startswith("postgresql://"):
            normalized = normalized.replace("postgresql://", "postgresql+asyncpg://", 1)

        if not normalized.startswith("postgresql+asyncpg://"):
            return normalized

        parsed = urlsplit(normalized)
        query = []
        for key, query_value in parse_qsl(parsed.query, keep_blank_values=True):
            query.append(("ssl" if key == "sslmode" else key, query_value))
        return urlunsplit(
            (parsed.scheme, parsed.netloc, parsed.path, urlencode(query), parsed.fragment)
        )

    @model_validator(mode="after")
    def validate_production_safety(self) -> "Settings":
        if self.app_env.lower() != "production":
            return self

        if self.debug:
            raise ValueError("DEBUG must be false in production")
        if not self.cookie_secure:
            raise ValueError("COOKIE_SECURE must be true in production")
        if self.email_provider == "capture":
            raise ValueError("EMAIL_PROVIDER must be a real transactional provider in production")
        if not self.email_api_key:
            raise ValueError("EMAIL_API_KEY must be configured in production")
        if len(self.jwt_secret_key) < 32:
            raise ValueError("JWT_SECRET_KEY must contain at least 32 characters in production")
        if "replace-with" in self.jwt_secret_key.lower() or self.jwt_secret_key == (
            "test-secret-key-for-fashionos-32-bytes"
        ):
            raise ValueError("JWT_SECRET_KEY must be a unique production secret")

        frontend = urlsplit(self.frontend_origin)
        if (
            frontend.scheme != "https"
            or frontend.hostname in {"localhost", "127.0.0.1", "::1"}
            or frontend.path not in {"", "/"}
            or frontend.query
            or frontend.fragment
            or frontend.username
            or frontend.password
        ):
            raise ValueError("FRONTEND_URL must be a public HTTPS origin in production")

        database = urlsplit(self.database_url)
        if database.scheme != "postgresql+asyncpg":
            raise ValueError(
                "DATABASE_URL must use PostgreSQL with the asyncpg driver in production"
            )
        if database.hostname in {None, "localhost", "127.0.0.1", "::1"}:
            raise ValueError("DATABASE_URL must point to managed PostgreSQL in production")
        query = dict(parse_qsl(database.query, keep_blank_values=True))
        if query.get("ssl", "").lower() not in {"require", "verify-ca", "verify-full", "true"}:
            raise ValueError("DATABASE_URL must require TLS with ssl=require in production")
        return self

    @property
    def frontend_origin(self) -> str:
        return str(self.frontend_url).rstrip("/")

    @property
    def allowed_frontend_origins(self) -> list[str]:
        """Allow the two loopback host spellings during local development only."""
        origins = {self.frontend_origin}
        parsed = urlsplit(self.frontend_origin)
        if self.app_env.lower() == "development" and parsed.hostname in {
            "127.0.0.1",
            "localhost",
        }:
            alternate_host = "localhost" if parsed.hostname == "127.0.0.1" else "127.0.0.1"
            netloc = alternate_host
            if parsed.port is not None:
                netloc = f"{alternate_host}:{parsed.port}"
            origins.add(urlunsplit((parsed.scheme, netloc, "", "", "")))
        return sorted(origins)


@lru_cache
def get_settings() -> Settings:
    return Settings()
