from sqlalchemy.ext.asyncio import AsyncSession

from app.models.business import Business
from app.models.user import User
from app.schemas.business import BusinessUpdate


async def update_business(
    session: AsyncSession,
    business: Business,
    payload: BusinessUpdate,
    actor: User | None = None,
) -> Business:
    updates = payload.model_dump(exclude_unset=True, mode="json")
    for field, value in updates.items():
        setattr(business, field, value)
    if actor and ("order_status_configuration" in updates or "audit_configuration" in updates):
        from app.services.order_service import add_business_audit
        add_business_audit(session, business, actor, "BUSINESS_SETTINGS_UPDATED", "Updated order workflow or audit capture settings", details={"fields": sorted(set(updates) & {"order_status_configuration", "audit_configuration"})})
    await session.commit()
    await session.refresh(business)
    return business
