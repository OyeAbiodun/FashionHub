from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.schemas.business import BusinessUpdate


async def update_business(
    session: AsyncSession,
    business: Business,
    payload: BusinessUpdate,
) -> Business:
    updates = payload.model_dump(exclude_unset=True, mode="json")
    for field, value in updates.items():
        setattr(business, field, value)
    await session.commit()
    await session.refresh(business)
    return business
