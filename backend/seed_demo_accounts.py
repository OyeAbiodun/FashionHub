import asyncio
import os
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.core.security import hash_password
from app.models.base import Base
from app.models.business import Business
from app.models.user import User, UserRole

DATABASE_URL = "sqlite+aiosqlite:///./fashionos.db"


def seed_password() -> str:
    value = os.environ.get("SEED_DEMO_PASSWORD")
    if not value:
        raise RuntimeError("Set SEED_DEMO_PASSWORD before running this development-only script.")
    return value


async def seed_demo():
    password = seed_password()
    engine = create_async_engine(DATABASE_URL)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        # 1. Super Admin Account
        sa_email = "superadmin@fashionos.ng"
        res_sa = await session.execute(select(User).where(User.email == sa_email))
        if not res_sa.scalar_one_or_none():
            b_hq = Business(
                id=uuid.uuid4(),
                name="FashionOS Admin HQ",
                phone="+2348000000099",
                email=sa_email,
                currency="NGN",
                timezone="Africa/Lagos",
                enabled_features=[
                    "customers",
                    "measurements",
                    "templates",
                    "orders",
                    "invoices",
                    "reports",
                    "team",
                    "tasks",
                ],
                max_staff_users=100,
                is_active=True
            )
            session.add(b_hq)
            await session.flush()

            u_sa = User(
                id=uuid.uuid4(),
                business_id=b_hq.id,
                first_name="Super",
                last_name="Admin",
                email=sa_email,
                phone="+2348000000099",
                password_hash=hash_password(password),
                role=UserRole.SUPER_ADMIN,
                is_active=True
            )
            session.add(u_sa)

        # 2. Business Owner Account
        owner_email = "owner@lagosbespoke.ng"
        res_owner = await session.execute(select(User).where(User.email == owner_email))
        if not res_owner.scalar_one_or_none():
            b_bespoke = Business(
                id=uuid.uuid4(),
                name="Lagos Bespoke Studio",
                phone="+2348011112222",
                email=owner_email,
                currency="NGN",
                timezone="Africa/Lagos",
                enabled_features=[
                    "customers",
                    "measurements",
                    "templates",
                    "orders",
                    "invoices",
                    "reports",
                    "team",
                    "tasks",
                ],
                max_staff_users=15,
                is_active=True
            )
            session.add(b_bespoke)
            await session.flush()

            u_owner = User(
                id=uuid.uuid4(),
                business_id=b_bespoke.id,
                first_name="Ada",
                last_name="Okafor",
                email=owner_email,
                phone="+2348011112222",
                password_hash=hash_password(password),
                role=UserRole.BUSINESS_ADMIN,
                is_active=True
            )
            session.add(u_owner)

            # 3. Staff Account
            u_staff = User(
                id=uuid.uuid4(),
                business_id=b_bespoke.id,
                first_name="Emeka",
                last_name="Tailor",
                email="tailor@lagosbespoke.ng",
                phone="+2348033334444",
                password_hash=hash_password(password),
                role=UserRole.STAFF,
                permissions=[
                    "customers:read", "customers:write", "measurements:read", "measurements:write",
                    "orders:read", "orders:write",
                ],
                is_active=True
            )
            session.add(u_staff)

        # 4. User request email (textabi12@gmail.com)
        custom_email = "textabi12@gmail.com"
        res_custom = await session.execute(select(User).where(User.email == custom_email))
        if not res_custom.scalar_one_or_none():
            b_textabi = Business(
                id=uuid.uuid4(),
                name="Textabi Bespoke Atelier",
                phone="+2348099887766",
                email=custom_email,
                currency="NGN",
                timezone="Africa/Lagos",
                enabled_features=[
                    "customers",
                    "measurements",
                    "templates",
                    "orders",
                    "invoices",
                    "reports",
                    "team",
                    "tasks",
                ],
                max_staff_users=20,
                is_active=True
            )
            session.add(b_textabi)
            await session.flush()

            u_custom = User(
                id=uuid.uuid4(),
                business_id=b_textabi.id,
                first_name="Textabi",
                last_name="Admin",
                email=custom_email,
                phone="+2348099887766",
                password_hash=hash_password(password),
                role=UserRole.SUPER_ADMIN,
                is_active=True
            )
            session.add(u_custom)

        await session.commit()
        print("Demo accounts seeded successfully!")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(seed_demo())
