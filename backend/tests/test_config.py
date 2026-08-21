import pytest
from pydantic import ValidationError

from app.core.config import Settings


def production_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "APP_ENV": "production",
        "DEBUG": False,
        "FRONTEND_URL": "https://app.fashionos.example",
        "DATABASE_URL": (
            "postgresql://fashionos:password@db.fashionos.example:5432/fashionos?sslmode=require"
        ),
        "JWT_SECRET_KEY": "a-production-secret-that-is-at-least-32-characters",
        "COOKIE_SECURE": True,
        "EMAIL_PROVIDER": "resend",
        "EMAIL_API_KEY": "re_platform_secret",
        "EMAIL_FROM_ADDRESS": "no-reply@fashionos.example",
        "EMAIL_FROM_NAME": "FashionOS",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[arg-type]


def test_managed_postgres_url_is_normalized_for_asyncpg() -> None:
    settings = production_settings()

    assert settings.database_url.startswith("postgresql+asyncpg://")
    assert settings.database_url.endswith("?ssl=require")


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"DEBUG": True}, "DEBUG must be false"),
        ({"COOKIE_SECURE": False}, "COOKIE_SECURE must be true"),
        ({"EMAIL_PROVIDER": "capture"}, "EMAIL_PROVIDER must be a real transactional provider"),
        ({"EMAIL_API_KEY": ""}, "EMAIL_API_KEY must be configured"),
        ({"JWT_SECRET_KEY": "too-short"}, "at least 32 characters"),
        (
            {"JWT_SECRET_KEY": "replace-with-a-secret-manager-value-of-at-least-32-characters"},
            "unique production secret",
        ),
        ({"FRONTEND_URL": "http://app.fashionos.example"}, "public HTTPS origin"),
        ({"FRONTEND_URL": "https://app.fashionos.example/path"}, "public HTTPS origin"),
        (
            {"DATABASE_URL": "sqlite+aiosqlite:///fashionos.db"},
            "must use PostgreSQL",
        ),
        (
            {
                "DATABASE_URL": (
                    "postgresql+asyncpg://fashionos:password@localhost:5432/fashionos?ssl=require"
                )
            },
            "managed PostgreSQL",
        ),
        (
            {
                "DATABASE_URL": (
                    "postgresql+asyncpg://fashionos:password@db.fashionos.example:5432/fashionos"
                )
            },
            "must require TLS",
        ),
    ],
)
def test_unsafe_production_configuration_is_rejected(
    override: dict[str, object], message: str
) -> None:
    with pytest.raises(ValidationError, match=message):
        production_settings(**override)
