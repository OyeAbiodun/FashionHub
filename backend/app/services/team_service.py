import hashlib
import html
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import quote

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import hash_password
from app.models.business import Business
from app.models.membership import BusinessInvitation, BusinessMembership
from app.models.role import Role
from app.models.user import User, UserRole
from app.schemas.team import (
    BusinessInvitationCreate,
    BusinessInvitationPublic,
    StaffPublic,
    StaffUpdate,
)
from app.services.email_service import (
    EmailDeliveryError,
    TransactionalEmail,
    get_configured_email_provider,
)


async def list_team_members(session: AsyncSession, business: Business) -> list[StaffPublic]:
    stmt = (
        select(BusinessMembership, User)
        .join(User, BusinessMembership.user_id == User.id)
        .where(BusinessMembership.business_id == business.id)
        .order_by(BusinessMembership.created_at.asc())
    )
    rows = (await session.execute(stmt)).all()
    members = []
    for membership, user in rows:
        members.append(
            StaffPublic.model_validate(user).model_copy(update={"membership_id": membership.id})
        )
    return members


async def create_staff_invitation(
    session: AsyncSession,
    business: Business,
    actor: User,
    payload: BusinessInvitationCreate,
    settings: Settings,
) -> BusinessInvitationPublic:
    _validate_team_role_assignment(actor, payload.role)
    locked_business = await session.scalar(
        select(Business).where(Business.id == business.id).with_for_update()
    )
    if locked_business is None or not locked_business.is_active:
        raise HTTPException(status_code=404, detail="Business workspace not found.")
    existing = await session.scalar(select(User.id).where(User.email == payload.email))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This email already has an account. Existing account invitations are not "
                "supported yet."
            ),
        )
    try:
        provider = await get_configured_email_provider(session, settings)
    except EmailDeliveryError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Platform email delivery is unavailable. Contact the platform administrator.",
        ) from exc
    if provider is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Team invitations need an enabled platform email configuration.",
        )

    now = datetime.now(UTC)
    active_members = await session.scalar(
        select(func.count(BusinessMembership.id)).where(
            BusinessMembership.business_id == business.id
        )
    )
    other_pending = await session.scalar(
        select(func.count(BusinessInvitation.id)).where(
            BusinessInvitation.business_id == business.id,
            BusinessInvitation.status == "PENDING",
            BusinessInvitation.email != payload.email,
            BusinessInvitation.expires_at > now,
        )
    )
    if (active_members or 0) + (other_pending or 0) >= locked_business.max_staff_users:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Staff account limit reached ({locked_business.max_staff_users} accounts, "
                "pending invitations)."
            ),
        )

    custom_role = await _validate_custom_role(session, business, payload.custom_role_id)
    pending = (
        await session.scalars(
            select(BusinessInvitation)
            .where(
                BusinessInvitation.business_id == business.id,
                BusinessInvitation.email == payload.email,
                BusinessInvitation.status == "PENDING",
            )
            .with_for_update()
        )
    ).all()
    for old_invitation in pending:
        old_invitation.status = "REVOKED"
        old_invitation.revoked_at = now

    token = secrets.token_urlsafe(32)
    invitation = BusinessInvitation(
        business_id=business.id,
        invited_by_user_id=actor.id,
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        email=payload.email,
        phone=payload.phone.strip() if payload.phone else None,
        role=payload.role.value,
        permissions=payload.permissions,
        custom_role_id=custom_role.id if custom_role else None,
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        status="PENDING",
        expires_at=now + timedelta(hours=48),
    )
    session.add(invitation)
    await session.commit()
    await session.refresh(invitation)

    invite_url = f"{settings.frontend_origin}/accept-invitation?token={quote(token)}"
    safe_name = html.escape(invitation.first_name)
    safe_business = html.escape(business.name)
    message = TransactionalEmail(
        to=invitation.email,
        subject=f"You are invited to join {business.name} on FashionOS",
        text=(
            f"Hello {invitation.first_name},\n\n{business.name} invited you to join its "
            f"FashionOS workspace as {payload.role.value.replace('_', ' ').title()}. "
            f"Accept and set your own password within 48 hours: {invite_url}\n\n"
            "If you were not expecting this invitation, you can ignore this email."
        ),
        html=(
            f"<p>Hello {safe_name},</p><p><strong>{safe_business}</strong> invited you to "
            "join its FashionOS workspace as "
            f"{html.escape(payload.role.value.replace('_', ' ').title())}.</p>"
            f'<p><a href="{html.escape(invite_url, quote=True)}">'
            "Accept invitation and set your password</a></p>"
            "<p>This link expires in 48 hours. Ignore this email if you were not expecting it.</p>"
        ),
    )
    try:
        await provider.send(message)
    except EmailDeliveryError as exc:
        await session.delete(invitation)
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The invitation email could not be delivered. No invitation is pending.",
        ) from exc
    return BusinessInvitationPublic.model_validate(invitation)


async def list_business_invitations(
    session: AsyncSession, business: Business
) -> list[BusinessInvitationPublic]:
    rows = (
        await session.scalars(
            select(BusinessInvitation)
            .where(BusinessInvitation.business_id == business.id)
            .order_by(BusinessInvitation.created_at.desc())
            .limit(200)
        )
    ).all()
    now = datetime.now(UTC)
    return [
        BusinessInvitationPublic.model_validate(row).model_copy(
            update={
                "status": "EXPIRED"
                if row.status == "PENDING" and _utc_datetime(row.expires_at) <= now
                else row.status
            }
        )
        for row in rows
    ]


async def resend_business_invitation(
    session: AsyncSession,
    business: Business,
    actor: User,
    invitation_id: uuid.UUID,
    settings: Settings,
) -> BusinessInvitationPublic:
    invitation = await session.scalar(
        select(BusinessInvitation).where(
            BusinessInvitation.id == invitation_id,
            BusinessInvitation.business_id == business.id,
            BusinessInvitation.status == "PENDING",
        )
    )
    if invitation is None:
        raise HTTPException(status_code=404, detail="Pending invitation not found.")
    return await create_staff_invitation(
        session,
        business,
        actor,
        BusinessInvitationCreate(
            first_name=invitation.first_name,
            last_name=invitation.last_name,
            email=invitation.email,
            phone=invitation.phone,
            role=UserRole(invitation.role),
            permissions=invitation.permissions,
            custom_role_id=invitation.custom_role_id,
        ),
        settings,
    )


async def revoke_business_invitation(
    session: AsyncSession, business: Business, invitation_id: uuid.UUID
) -> BusinessInvitationPublic:
    await session.scalar(
        select(Business.id).where(Business.id == business.id).with_for_update()
    )
    invitation = await session.scalar(
        select(BusinessInvitation)
        .where(
            BusinessInvitation.id == invitation_id,
            BusinessInvitation.business_id == business.id,
        )
        .with_for_update()
    )
    if invitation is None:
        raise HTTPException(status_code=404, detail="Invitation not found.")
    if invitation.status == "PENDING":
        invitation.status = "REVOKED"
        invitation.revoked_at = datetime.now(UTC)
        await session.commit()
        await session.refresh(invitation)
    return BusinessInvitationPublic.model_validate(invitation)


async def accept_business_invitation(
    session: AsyncSession, token: str, password: str
) -> User:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    candidate = await session.scalar(
        select(BusinessInvitation)
        .where(
            BusinessInvitation.token_hash == token_hash,
            BusinessInvitation.status == "PENDING",
        )
    )
    if candidate is None:
        raise HTTPException(status_code=400, detail="Invitation is invalid or has expired.")
    business = await session.scalar(
        select(Business).where(Business.id == candidate.business_id).with_for_update()
    )
    if business is None or not business.is_active:
        raise HTTPException(status_code=400, detail="Invitation is no longer valid.")
    invitation = await session.scalar(
        select(BusinessInvitation)
        .where(
            BusinessInvitation.id == candidate.id,
            BusinessInvitation.status == "PENDING",
        )
        .with_for_update()
    )
    now = datetime.now(UTC)
    if invitation is None:
        raise HTTPException(status_code=400, detail="Invitation is invalid or has expired.")
    if _utc_datetime(invitation.expires_at) <= now:
        invitation.status = "EXPIRED"
        await session.commit()
        raise HTTPException(status_code=400, detail="Invitation is invalid or has expired.")
    if await session.scalar(select(User.id).where(User.email == invitation.email)) is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                "This email already has an account. Multi-business invitations are not available "
                "yet."
            ),
        )
    member_count = await session.scalar(
        select(func.count(BusinessMembership.id)).where(
            BusinessMembership.business_id == invitation.business_id
        )
    )
    other_pending = await session.scalar(
        select(func.count(BusinessInvitation.id)).where(
            BusinessInvitation.business_id == business.id,
            BusinessInvitation.id != invitation.id,
            BusinessInvitation.status == "PENDING",
            BusinessInvitation.expires_at > now,
        )
    )
    if (member_count or 0) + (other_pending or 0) >= business.max_staff_users:
        raise HTTPException(
            status_code=409, detail="This business has reached its team account limit."
        )

    user = User(
        business=business,
        business_id=business.id,
        first_name=invitation.first_name,
        last_name=invitation.last_name,
        email=invitation.email,
        phone=invitation.phone,
        password_hash=hash_password(password),
        role=UserRole(invitation.role),
        permissions=invitation.permissions,
        custom_role_id=invitation.custom_role_id,
        is_active=True,
    )
    session.add(user)
    invitation.status = "ACCEPTED"
    invitation.accepted_at = now
    await session.flush()
    session.add(
        BusinessMembership(
            business_id=business.id,
            user_id=user.id,
            role=invitation.role,
            permissions=invitation.permissions,
            custom_role_id=invitation.custom_role_id,
            is_active=True,
        )
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email has just been registered. Sign in to the existing account.",
        ) from exc
    return user


def _utc_datetime(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


async def update_staff_member(
    session: AsyncSession,
    business: Business,
    actor: User,
    user_id: uuid.UUID,
    payload: StaffUpdate,
) -> StaffPublic:
    stmt = select(User).where(User.id == user_id, User.business_id == business.id)
    user = (await session.execute(stmt)).scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Staff member not found"
        )

    _validate_target_modification(actor, user)
    if payload.role is not None:
        _validate_team_role_assignment(actor, payload.role)
    custom_role = await _validate_custom_role(session, business, payload.custom_role_id)

    if payload.first_name is not None:
        user.first_name = payload.first_name.strip()
    if payload.last_name is not None:
        user.last_name = payload.last_name.strip()
    if payload.phone is not None:
        user.phone = payload.phone.strip() if payload.phone else None
    if payload.role is not None:
        user.role = payload.role
    if payload.permissions is not None:
        user.permissions = payload.permissions
    if "custom_role_id" in payload.model_fields_set:
        user.custom_role_id = custom_role.id if custom_role else None
    if payload.is_active is not None:
        user.is_active = payload.is_active

    membership = await session.scalar(
        select(BusinessMembership).where(
            BusinessMembership.business_id == business.id,
            BusinessMembership.user_id == user.id,
        )
    )
    if membership is None:
        membership = BusinessMembership(
            business_id=business.id,
            user_id=user.id,
            role=user.role.value,
            permissions=user.permissions,
            custom_role_id=user.custom_role_id,
            is_active=user.is_active,
        )
        session.add(membership)
    else:
        membership.role = user.role.value
        membership.permissions = user.permissions
        membership.custom_role_id = user.custom_role_id
        membership.is_active = user.is_active

    await session.commit()
    await session.refresh(user)
    return StaffPublic.model_validate(user)


def _validate_team_role_assignment(actor: User, requested_role: UserRole) -> None:
    if requested_role not in {UserRole.STAFF, UserRole.BUSINESS_ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Team management cannot assign owner or Super Admin privileges.",
        )
    if actor.role == UserRole.BUSINESS_ADMIN and requested_role != UserRole.STAFF:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Business admins can only manage staff accounts.",
        )


def _validate_target_modification(actor: User, target: User) -> None:
    if target.role in {UserRole.OWNER, UserRole.SUPER_ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Privileged accounts cannot be modified through tenant team management.",
        )
    if actor.role == UserRole.BUSINESS_ADMIN and target.role != UserRole.STAFF:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Business admins can only manage staff accounts.",
        )


async def _validate_custom_role(
    session: AsyncSession, business: Business, custom_role_id: uuid.UUID | None
) -> Role | None:
    if custom_role_id is None:
        return None
    role = (
        await session.execute(
            select(Role).where(Role.id == custom_role_id, Role.business_id == business.id)
        )
    ).scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom role not found")
    return role
