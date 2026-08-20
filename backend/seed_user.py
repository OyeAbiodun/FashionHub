import asyncio
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.core.security import hash_password
from app.models.base import Base
from app.models.business import Business
from app.models.user import User, UserRole

DATABASE_URL = "sqlite+aiosqlite:///./fashionos.db"

async def seed():
    engine = create_async_engine(DATABASE_URL)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        # Check if user already exists
        res = await session.execute(select(User).where(User.email == "textabi12@gmail.com"))
        existing_user = res.scalar_one_or_none()

        target_password = "FashionOS2026!"
        password_hash = hash_password(target_password)

        if existing_user:
            existing_user.password_hash = password_hash
            existing_user.role = UserRole.SUPER_ADMIN
            await session.commit()
            print(f"Updated password and SUPER_ADMIN role for textabi12@gmail.com -> Password: {target_password}")
        else:
            # Create Business
            business = Business(
                id=uuid.uuid4(),
                name="Textabi Fashion House",
                phone="+2348012345678",
                email="textabi12@gmail.com",
                currency="NGN",
                timezone="Africa/Lagos",
                enabled_features=["customers", "measurements", "templates", "orders", "invoices", "reports", "team"],
                max_staff_users=50,
                is_active=True
            )
            session.add(business)
            await session.flush()

            # Create User with SUPER_ADMIN role
            user = User(
                id=uuid.uuid4(),
                business_id=business.id,
                first_name="Textabi",
                last_name="Admin",
                email="textabi12@gmail.com",
                phone="+2348012345678",
                password_hash=password_hash,
                role=UserRole.SUPER_ADMIN,
                is_active=True
            )
            session.add(user)
            await session.commit()
            print(f"Successfully created account textabi12@gmail.com with password: {target_password} (SUPER_ADMIN)")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(seed())
