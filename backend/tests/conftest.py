import os
from collections.abc import AsyncGenerator

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-fashionos-32-bytes")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import get_db_session
from app.core.measurement_defaults import SYSTEM_MEASUREMENT_TEMPLATES, normalize_field_key
from app.main import app
from app.models.base import Base
from app.models.measurement import MeasurementTemplate, MeasurementTemplateField


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with session_factory() as seed_session:
        for name, garment_type, fields in SYSTEM_MEASUREMENT_TEMPLATES:
            template = MeasurementTemplate(
                name=name,
                garment_type=garment_type,
                description="System default measurement template.",
                is_system_template=True,
                is_active=True,
            )
            for position, field_name in enumerate(fields, start=1):
                template.fields.append(
                    MeasurementTemplateField(
                        field_name=field_name,
                        field_key=normalize_field_key(field_name),
                        position=position,
                        is_required=True,
                        unit_hint="inches",
                    )
                )
            seed_session.add(template)
        await seed_session.commit()

    async def override_session() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = override_session
    app.state.test_session_factory = session_factory
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://testserver"
    ) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    del app.state.test_session_factory
    await engine.dispose()


def register_payload(email: str = "owner@example.com") -> dict:
    return {
        "user": {
            "first_name": "Ada",
            "last_name": "Okafor",
            "email": email,
            "phone": "+2348011111111",
            "password": "StrongPass123!",
        },
        "business": {
            "name": "Ada Bespoke",
            "phone": "+2348022222222",
            "email": "hello@adabespoke.example.com",
            "address": "Lagos",
        },
    }
