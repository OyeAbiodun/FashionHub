import uuid
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.admin_audit import AdminAuditLog, PlatformAuditConfiguration
from app.models.business import Business
from app.models.customer import Customer
from app.models.finance import Payment, PaymentStatus
from app.models.order import Order
from app.models.user import User, UserRole
from app.schemas.admin import (
    AdminAuditItem,
    BusinessTenantDetail,
    PlatformActivityItem,
    PlatformMetrics,
    UpdateBusinessEntitlements,
)


async def get_platform_metrics(session: AsyncSession) -> PlatformMetrics:
    total_b_result = await session.execute(select(func.count(Business.id)))
    total_businesses = total_b_result.scalar_one_or_none() or 0

    active_b_result = await session.execute(
        select(func.count(Business.id)).where(Business.is_active.is_(True))
    )
    active_businesses = active_b_result.scalar_one_or_none() or 0

    total_u_result = await session.execute(select(func.count(User.id)))
    total_users = total_u_result.scalar_one_or_none() or 0

    total_c_result = await session.execute(select(func.count(Customer.id)))
    total_customers = total_c_result.scalar_one_or_none() or 0

    total_o_result = await session.execute(select(func.count(Order.id)))
    total_orders = total_o_result.scalar_one_or_none() or 0

    currency_result = await session.execute(
        select(Business.currency, func.coalesce(func.sum(Payment.amount), 0))
        .join(Payment, Payment.business_id == Business.id)
        .where(Payment.status == PaymentStatus.SUCCESSFUL)
        .group_by(Business.currency)
    )
    collected_by_currency = {
        currency: f"{Decimal(str(amount)):.2f}" for currency, amount in currency_result.all()
    }

    return PlatformMetrics(
        total_businesses=total_businesses,
        active_businesses=active_businesses,
        total_users=total_users,
        total_customers=total_customers,
        total_orders=total_orders,
        collected_by_currency=collected_by_currency,
    )


async def list_all_businesses(
    session: AsyncSession,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
    active_only: bool = False,
) -> tuple[list[BusinessTenantDetail], int]:
    stmt = select(Business)
    if active_only:
        stmt = stmt.where(Business.is_active.is_(True))
    if search and search.strip():
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            (Business.name.ilike(term))
            | (Business.phone.ilike(term))
            | (Business.email.ilike(term))
        )

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_count = (await session.execute(count_stmt)).scalar_one_or_none() or 0

    stmt = stmt.order_by(Business.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    businesses = (await session.execute(stmt)).scalars().all()

    items: list[BusinessTenantDetail] = []
    for b in businesses:
        detail = await get_business_tenant_detail(session, b.id, business_obj=b)
        items.append(detail)

    return items, total_count


async def get_business_tenant_detail(
    session: AsyncSession, business_id: uuid.UUID, business_obj: Business | None = None
) -> BusinessTenantDetail:
    if business_obj is None:
        result = await session.execute(select(Business).where(Business.id == business_id))
        business_obj = result.scalar_one_or_none()
        if business_obj is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Business tenant not found"
            )

    u_count = (
        await session.execute(
            select(func.count(User.id)).where(User.business_id == business_obj.id)
        )
    ).scalar_one_or_none() or 0

    active_user_count = (
        await session.execute(
            select(func.count(User.id)).where(
                User.business_id == business_obj.id,
                User.is_active.is_(True),
            )
        )
    ).scalar_one_or_none() or 0
    owner = await session.scalar(
        select(User)
        .where(
            User.business_id == business_obj.id,
            User.role.in_([UserRole.OWNER, UserRole.BUSINESS_ADMIN]),
        )
        .order_by(User.created_at.asc())
        .limit(1)
    )

    c_count = (
        await session.execute(
            select(func.count(Customer.id)).where(Customer.business_id == business_obj.id)
        )
    ).scalar_one_or_none() or 0

    o_count = (
        await session.execute(
            select(func.count(Order.id)).where(Order.business_id == business_obj.id)
        )
    ).scalar_one_or_none() or 0

    rev_val = (
        await session.execute(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.business_id == business_obj.id,
                Payment.status == PaymentStatus.SUCCESSFUL,
            )
        )
    ).scalar_one_or_none() or 0

    return BusinessTenantDetail(
        id=business_obj.id,
        name=business_obj.name,
        email=business_obj.email,
        phone=business_obj.phone,
        address=business_obj.address,
        logo_url=business_obj.logo_url,
        currency=business_obj.currency,
        timezone=business_obj.timezone,
        enabled_features=business_obj.enabled_features or [],
        max_staff_users=business_obj.max_staff_users,
        is_active=business_obj.is_active,
        created_at=business_obj.created_at,
        audit_configuration=business_obj.audit_configuration or {},
        owner_name=(
            " ".join(part for part in (owner.first_name, owner.last_name) if part)
            if owner
            else None
        ),
        owner_email=owner.email if owner else None,
        owner_phone=owner.phone if owner else None,
        active_user_count=active_user_count,
        user_count=u_count,
        customer_count=c_count,
        order_count=o_count,
        total_revenue=f"{Decimal(str(rev_val)):.2f}",
        subscription_plan_id=business_obj.subscription_plan_id,
        subscription_selected_at=business_obj.subscription_selected_at,
    )


async def update_business_entitlements(
    session: AsyncSession,
    business_id: uuid.UUID,
    payload: UpdateBusinessEntitlements,
    actor: User | None = None,
    request=None,
) -> BusinessTenantDetail:
    result = await session.execute(select(Business).where(Business.id == business_id))
    business_obj = result.scalar_one_or_none()
    if business_obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Business tenant not found"
        )

    old_values = {
        "enabled_features": business_obj.enabled_features,
        "max_staff_users": business_obj.max_staff_users,
    }
    business_obj.enabled_features = payload.enabled_features
    business_obj.max_staff_users = payload.max_staff_users
    if actor:
        await record_admin_action(
            session,
            actor,
            "BUSINESS_ENTITLEMENTS_UPDATED",
            f"Updated feature access and staff limit for {business_obj.name}",
            business_obj.id,
            {
                "before": old_values,
                "after": {
                    "enabled_features": payload.enabled_features,
                    "max_staff_users": payload.max_staff_users,
                },
            },
            request,
        )
    await session.commit()
    await session.refresh(business_obj)
    return await get_business_tenant_detail(session, business_id, business_obj=business_obj)


async def toggle_business_active(
    session: AsyncSession, business_id: uuid.UUID, actor: User | None = None, request=None
) -> BusinessTenantDetail:
    result = await session.execute(select(Business).where(Business.id == business_id))
    business_obj = result.scalar_one_or_none()
    if business_obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Business tenant not found"
        )

    business_obj.is_active = not business_obj.is_active
    if actor:
        await record_admin_action(
            session,
            actor,
            "BUSINESS_ACTIVATED" if business_obj.is_active else "BUSINESS_SUSPENDED",
            f"{'Activated' if business_obj.is_active else 'Suspended'} {business_obj.name}",
            business_obj.id,
            {"is_active": business_obj.is_active},
            request,
        )
    await session.commit()
    await session.refresh(business_obj)
    return await get_business_tenant_detail(session, business_id, business_obj=business_obj)


async def get_recent_platform_activity(
    session: AsyncSession, limit: int = 20
) -> list[PlatformActivityItem]:
    items: list[PlatformActivityItem] = []

    # Recent business registrations
    recent_b = (
        (await session.execute(select(Business).order_by(Business.created_at.desc()).limit(limit)))
        .scalars()
        .all()
    )
    for b in recent_b:
        items.append(
            PlatformActivityItem(
                id=f"b-{b.id}",
                type="BUSINESS_REGISTERED",
                title="New Business Registered",
                description=f"{b.name} signed up on FashionOS",
                business_name=b.name,
                timestamp=b.created_at,
            )
        )

    recent_orders = (
        await session.execute(
            select(Order, Business)
            .join(Business, Business.id == Order.business_id)
            .order_by(Order.created_at.desc())
            .limit(limit)
        )
    ).all()
    for order, business in recent_orders:
        items.append(
            PlatformActivityItem(
                id=f"o-{order.id}",
                type="ORDER_CREATED",
                title="Order Created",
                description=f"Order {order.order_number} was created for {business.name}",
                business_name=business.name,
                timestamp=order.created_at,
                currency=business.currency,
            )
        )

    recent_payments = (
        await session.execute(
            select(Payment, Business)
            .join(Business, Business.id == Payment.business_id)
            .where(Payment.status == PaymentStatus.SUCCESSFUL)
            .order_by(Payment.paid_at.desc())
            .limit(limit)
        )
    ).all()
    for payment, business in recent_payments:
        items.append(
            PlatformActivityItem(
                id=f"p-{payment.id}",
                type="PAYMENT_RECEIVED",
                title="Payment Received",
                description=f"{business.name} recorded a successful payment",
                business_name=business.name,
                timestamp=payment.paid_at,
                currency=business.currency,
                amount=f"{payment.amount:.2f}",
            )
        )

    # Sort all by timestamp descending
    items.sort(key=lambda x: x.timestamp, reverse=True)
    return items[:limit]


async def record_admin_action(
    session: AsyncSession,
    actor: User,
    action: str,
    summary: str,
    business_id: uuid.UUID | None = None,
    details: dict | None = None,
    request=None,
) -> None:
    configuration = await session.get(PlatformAuditConfiguration, 1)
    if configuration is not None and not configuration.enabled:
        return
    session.add(
        AdminAuditLog(
            actor_id=actor.id,
            business_id=business_id,
            action=action,
            summary=summary,
            details=(details or {}) if configuration is None or configuration.capture_details else {},
            source_ip=request.client.host if request and request.client and (configuration is None or configuration.capture_ip) else None,
            user_agent=(request.headers.get("user-agent", "")[:500] or None) if request and (configuration is None or configuration.capture_device) else None,
        )
    )


async def get_platform_audit_configuration(session: AsyncSession) -> dict[str, bool]:
    configuration = await session.get(PlatformAuditConfiguration, 1)
    if configuration is None:
        return {"enabled": True, "capture_ip": True, "capture_device": True, "capture_details": True}
    return {"enabled": configuration.enabled, "capture_ip": configuration.capture_ip, "capture_device": configuration.capture_device, "capture_details": configuration.capture_details}


async def update_platform_audit_configuration(session: AsyncSession, values: dict[str, bool]) -> dict[str, bool]:
    configuration = await session.get(PlatformAuditConfiguration, 1)
    if configuration is None:
        configuration = PlatformAuditConfiguration(id=1)
        session.add(configuration)
    for key, value in values.items():
        setattr(configuration, key, value)
    await session.commit()
    return await get_platform_audit_configuration(session)


async def list_admin_audit(
    session: AsyncSession,
    limit: int = 50,
    search: str | None = None,
) -> list[AdminAuditItem]:
    stmt = (
        select(AdminAuditLog, User, Business)
        .join(User, User.id == AdminAuditLog.actor_id)
        .outerjoin(Business, Business.id == AdminAuditLog.business_id)
    )
    if search and search.strip():
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            AdminAuditLog.action.ilike(term)
            | AdminAuditLog.summary.ilike(term)
            | User.email.ilike(term)
            | Business.name.ilike(term)
        )
    rows = (
        await session.execute(stmt.order_by(AdminAuditLog.created_at.desc()).limit(limit))
    ).all()
    return [
        AdminAuditItem(
            id=entry.id,
            actor_name=f"{user.first_name} {user.last_name}",
            actor_email=user.email,
            action=entry.action,
            summary=entry.summary,
            business_id=entry.business_id,
            business_name=business.name if business else None,
            details=entry.details,
            source_ip=entry.source_ip,
            user_agent=entry.user_agent,
            timestamp=entry.created_at,
        )
        for entry, user, business in rows
    ]
