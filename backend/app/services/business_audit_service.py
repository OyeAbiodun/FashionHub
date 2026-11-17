from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_audit import BusinessAuditLog
from app.models.business import Business
from app.models.user import User
from app.schemas.admin import AdminAuditItem


async def list_business_audit(
    session: AsyncSession, business: Business, limit: int
) -> list[AdminAuditItem]:
    rows = (
        await session.execute(
            select(BusinessAuditLog, User)
            .join(User, User.id == BusinessAuditLog.actor_id)
            .where(BusinessAuditLog.business_id == business.id)
            .order_by(BusinessAuditLog.created_at.desc())
            .limit(limit)
        )
    ).all()
    return [
        AdminAuditItem(
            id=entry.id,
            actor_name=f"{user.first_name} {user.last_name}",
            actor_email=user.email,
            action=entry.action,
            summary=entry.summary,
            business_id=business.id,
            business_name=business.name,
            details=entry.details,
            source_ip=entry.source_ip,
            user_agent=entry.user_agent,
            timestamp=entry.created_at,
        )
        for entry, user in rows
    ]
