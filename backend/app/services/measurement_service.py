import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.measurement_defaults import SYSTEM_MEASUREMENT_TEMPLATES, normalize_field_key
from app.models.business import Business
from app.models.customer import Customer
from app.models.measurement import (
    MeasurementFieldType,
    MeasurementProfile,
    MeasurementTemplate,
    MeasurementTemplateField,
    MeasurementValue,
)
from app.models.user import User
from app.schemas.measurement import (
    GlobalMeasurementProfileListItem,
    GlobalMeasurementProfileListResponse,
    MeasurementProfileCreate,
    MeasurementProfileListItem,
    MeasurementProfileListResponse,
    MeasurementProfileResponse,
    MeasurementTemplateCreate,
    MeasurementTemplateFieldWrite,
    MeasurementTemplateUpdate,
    total_pages,
)
from app.services.customer_service import get_customer, normalize_phone


def profile_response(profile: MeasurementProfile) -> MeasurementProfileResponse:
    recorded_by_name = " ".join(
        part
        for part in [profile.recorded_by_user.first_name, profile.recorded_by_user.last_name]
        if part
    )
    return MeasurementProfileResponse(
        id=profile.id,
        customer_id=profile.customer_id,
        template_id=profile.template_id,
        template_name=profile.template.name if profile.template else None,
        name=profile.name,
        garment_type=profile.garment_type,
        unit=profile.unit,
        notes=profile.notes,
        recorded_at=profile.recorded_at,
        recorded_by=profile.recorded_by,
        recorded_by_name=recorded_by_name,
        archived_at=profile.archived_at,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
        values=list(profile.values),
    )


def visible_template_filter(business: Business):
    return or_(
        MeasurementTemplate.business_id.is_(None),
        MeasurementTemplate.business_id == business.id,
    )


def seed_default_templates_for_business(business: Business) -> None:
    for name, garment_type, fields in SYSTEM_MEASUREMENT_TEMPLATES:
        template = MeasurementTemplate(
            business=business,
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
                    field_type=MeasurementFieldType.NUMBER,
                    position=position,
                    is_required=True,
                    unit_hint="inches",
                    is_active=True,
                )
            )


async def ensure_system_templates(session: AsyncSession) -> None:
    result = await session.execute(
        select(MeasurementTemplate).where(MeasurementTemplate.is_system_template.is_(True))
    )
    existing = result.scalars().all()
    if existing:
        return
    for name, garment_type, fields in SYSTEM_MEASUREMENT_TEMPLATES:
        template = MeasurementTemplate(
            business_id=None,
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
                    field_type=MeasurementFieldType.NUMBER,
                    position=position,
                    is_required=True,
                    unit_hint="inches",
                    is_active=True,
                )
            )
        session.add(template)
    await session.commit()


async def list_templates(
    session: AsyncSession,
    business: Business,
) -> list[MeasurementTemplate]:
    business_template_count = (
        await session.execute(
            select(func.count(MeasurementTemplate.id)).where(
                MeasurementTemplate.business_id == business.id,
                MeasurementTemplate.is_active.is_(True),
            )
        )
    ).scalar_one()
    filters = (
        [MeasurementTemplate.business_id == business.id]
        if business_template_count
        else [visible_template_filter(business)]
    )
    result = await session.execute(
        select(MeasurementTemplate)
        .where(*filters, MeasurementTemplate.is_active.is_(True))
        .order_by(MeasurementTemplate.is_system_template.desc(), MeasurementTemplate.name.asc())
    )
    return list(result.scalars().all())


async def get_template(
    session: AsyncSession,
    business: Business,
    template_id: uuid.UUID,
) -> MeasurementTemplate:
    result = await session.execute(
        select(MeasurementTemplate)
        .options(selectinload(MeasurementTemplate.fields))
        .where(
            MeasurementTemplate.id == template_id,
            MeasurementTemplate.is_active.is_(True),
            visible_template_filter(business),
        )
    )
    template = result.scalar_one_or_none()
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    template.fields.sort(key=lambda field: field.position)
    return template


async def get_template_for_mutation(
    session: AsyncSession,
    business: Business,
    template_id: uuid.UUID,
) -> MeasurementTemplate:
    result = await session.execute(
        select(MeasurementTemplate)
        .options(selectinload(MeasurementTemplate.fields))
        .where(
            MeasurementTemplate.id == template_id,
            MeasurementTemplate.is_active.is_(True),
            MeasurementTemplate.business_id == business.id,
        )
    )
    template = result.scalar_one_or_none()
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    template.fields.sort(key=lambda field: field.position)
    return template


def _build_template_field(payload: MeasurementTemplateFieldWrite) -> MeasurementTemplateField:
    field = MeasurementTemplateField(id=payload.id or uuid.uuid4())
    _apply_template_field_payload(field, payload)
    return field


def _apply_template_field_payload(
    field: MeasurementTemplateField,
    payload: MeasurementTemplateFieldWrite,
) -> None:
    field.field_name = payload.field_name.strip()
    field.field_key = payload.field_key or normalize_field_key(payload.field_name)
    field.description = payload.description
    field.field_type = payload.field_type
    field.position = payload.position
    field.is_required = payload.is_required
    field.unit_hint = payload.unit_hint
    field.default_value = payload.default_value
    field.is_active = payload.is_active


def _replace_template_fields(
    template: MeasurementTemplate,
    fields: list[MeasurementTemplateFieldWrite],
) -> None:
    if not fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Measurement templates must contain at least one field.",
        )
    keys = [field.field_key for field in fields]
    if len(keys) != len(set(keys)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Measurement template fields cannot contain duplicate keys.",
        )
    existing_by_id = {field.id: field for field in template.fields}
    existing_by_key = {field.field_key: field for field in template.fields}
    next_fields: list[MeasurementTemplateField] = []
    for field_payload in fields:
        field = None
        if field_payload.id is not None:
            field = existing_by_id.get(field_payload.id)
        if field is None:
            field = existing_by_key.get(field_payload.field_key or "")
        if field is None:
            field = _build_template_field(field_payload)
        else:
            _apply_template_field_payload(field, field_payload)
        next_fields.append(field)
    template.fields = next_fields


async def create_template(
    session: AsyncSession,
    business: Business,
    payload: MeasurementTemplateCreate,
) -> MeasurementTemplate:
    template = MeasurementTemplate(
        business_id=business.id,
        name=payload.name.strip(),
        garment_type=payload.garment_type.strip(),
        description=payload.description,
        is_system_template=False,
        is_active=True,
    )
    _replace_template_fields(template, payload.fields)
    session.add(template)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    return await get_template_for_mutation(session, business, template.id)


async def update_template(
    session: AsyncSession,
    business: Business,
    template_id: uuid.UUID,
    payload: MeasurementTemplateUpdate,
) -> MeasurementTemplate:
    template = await get_template_for_mutation(session, business, template_id)
    if payload.name is not None:
        template.name = payload.name.strip()
    if payload.garment_type is not None:
        template.garment_type = payload.garment_type.strip()
    if "description" in payload.model_fields_set:
        template.description = payload.description
    if payload.is_active is not None:
        template.is_active = payload.is_active
    if payload.fields is not None:
        _replace_template_fields(template, payload.fields)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    return await get_template_for_mutation(session, business, template.id)


async def archive_template(
    session: AsyncSession,
    business: Business,
    template_id: uuid.UUID,
) -> None:
    template = await get_template_for_mutation(session, business, template_id)
    template.is_active = False
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        raise


def validate_template_values(
    template: MeasurementTemplate,
    payload: MeasurementProfileCreate,
) -> None:
    active_fields = [field for field in template.fields if field.is_active]
    template_fields = {field.field_key: field for field in active_fields}
    submitted_keys = {normalize_field_key(value.field_key) for value in payload.values}
    required_keys = {field.field_key for field in active_fields if field.is_required}
    unknown_keys = submitted_keys - set(template_fields)
    missing_keys = required_keys - submitted_keys
    if unknown_keys:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Unknown measurement field: {sorted(unknown_keys)[0]}",
        )
    if missing_keys:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Required measurement field is missing: {sorted(missing_keys)[0]}",
        )


async def create_measurement_profile(
    session: AsyncSession,
    business: Business,
    current_user: User,
    customer_id: uuid.UUID,
    payload: MeasurementProfileCreate,
) -> MeasurementProfile:
    customer = await get_customer(session, business, customer_id)
    if customer.archived_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Archived customers cannot receive new measurements.",
        )
    template = await get_template(session, business, payload.template_id)
    validate_template_values(template, payload)

    profile = MeasurementProfile(
        business_id=business.id,
        customer_id=customer.id,
        template_id=template.id,
        name=payload.name.strip(),
        garment_type=payload.garment_type.strip(),
        unit=payload.unit,
        notes=payload.notes,
        recorded_by=current_user.id,
        recorded_at=payload.recorded_at or datetime.now(UTC),
    )
    template_fields = {field.field_key: field for field in template.fields if field.is_active}
    for value in payload.values:
        template_field = template_fields[normalize_field_key(value.field_key)]
        profile.values.append(
            MeasurementValue(
                field_key=template_field.field_key,
                field_name=template_field.field_name,
                value=value.value,
                notes=value.notes,
                position=template_field.position,
            )
        )
    session.add(profile)
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    return await get_measurement_profile(session, business, profile.id)


async def list_customer_measurement_profiles(
    session: AsyncSession,
    business: Business,
    customer_id: uuid.UUID,
    page: int,
    page_size: int,
    archived: bool,
) -> MeasurementProfileListResponse:
    await get_customer(session, business, customer_id)
    base_query = (
        select(MeasurementProfile)
        .where(
            MeasurementProfile.business_id == business.id,
            MeasurementProfile.customer_id == customer_id,
        )
        .options(
            selectinload(MeasurementProfile.template),
            selectinload(MeasurementProfile.recorded_by_user),
            selectinload(MeasurementProfile.values),
        )
    )
    if archived:
        base_query = base_query.where(MeasurementProfile.archived_at.is_not(None))
    else:
        base_query = base_query.where(MeasurementProfile.archived_at.is_(None))

    total_query = select(func.count()).select_from(base_query.order_by(None).subquery())
    total = (await session.execute(total_query)).scalar_one()
    result = await session.execute(
        base_query.order_by(MeasurementProfile.recorded_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    profiles = result.scalars().all()
    items = [
        MeasurementProfileListItem(
            id=profile.id,
            name=profile.name,
            garment_type=profile.garment_type,
            unit=profile.unit,
            template_name=profile.template.name if profile.template else None,
            recorded_at=profile.recorded_at,
            recorded_by_name=" ".join(
                part
                for part in [
                    profile.recorded_by_user.first_name,
                    profile.recorded_by_user.last_name,
                ]
                if part
            ),
            archived_at=profile.archived_at,
            value_count=len(profile.values),
        )
        for profile in profiles
    ]
    return MeasurementProfileListResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total,
        total_pages=total_pages(total, page_size),
    )


async def list_measurement_profiles(
    session: AsyncSession,
    business: Business,
    search: str | None,
    garment_type: str | None,
    archived: bool,
    page: int,
    page_size: int,
) -> GlobalMeasurementProfileListResponse:
    value_count = (
        select(func.count(MeasurementValue.id))
        .where(MeasurementValue.measurement_profile_id == MeasurementProfile.id)
        .correlate(MeasurementProfile)
        .scalar_subquery()
        .label("value_count")
    )
    filters = [
        MeasurementProfile.business_id == business.id,
        Customer.business_id == business.id,
    ]
    if archived:
        filters.append(MeasurementProfile.archived_at.is_not(None))
    else:
        filters.append(MeasurementProfile.archived_at.is_(None))
    if search and (term := search.strip()):
        text_term = f"%{term}%"
        phone_term = f"%{normalize_phone(term)}%"
        filters.append(
            or_(
                Customer.first_name.ilike(text_term),
                Customer.last_name.ilike(text_term),
                Customer.phone.ilike(text_term),
                Customer.phone_normalized.like(phone_term),
                MeasurementProfile.name.ilike(text_term),
                MeasurementProfile.garment_type.ilike(text_term),
            )
        )
    if garment_type and (garment := garment_type.strip()):
        filters.append(func.lower(MeasurementProfile.garment_type) == garment.lower())

    joins = (
        select(MeasurementProfile.id)
        .join(Customer, Customer.id == MeasurementProfile.customer_id)
        .where(*filters)
    )
    total = (await session.execute(select(func.count()).select_from(joins.subquery()))).scalar_one()
    result = await session.execute(
        select(
            MeasurementProfile.id,
            MeasurementProfile.name,
            MeasurementProfile.garment_type,
            MeasurementProfile.unit,
            MeasurementProfile.recorded_at,
            MeasurementProfile.archived_at,
            Customer.id,
            Customer.first_name,
            Customer.last_name,
            Customer.phone,
            MeasurementTemplate.name,
            User.first_name,
            User.last_name,
            value_count,
        )
        .join(Customer, Customer.id == MeasurementProfile.customer_id)
        .outerjoin(MeasurementTemplate, MeasurementTemplate.id == MeasurementProfile.template_id)
        .outerjoin(User, User.id == MeasurementProfile.recorded_by)
        .where(*filters)
        .order_by(MeasurementProfile.recorded_at.desc(), MeasurementProfile.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = []
    for row in result.all():
        customer_name = " ".join(part for part in [row[7], row[8]] if part)
        recorded_by_name = " ".join(part for part in [row[11], row[12]] if part) or None
        items.append(
            GlobalMeasurementProfileListItem(
                profile_id=row[0],
                profile_name=row[1],
                garment_type=row[2],
                unit=row[3],
                recorded_at=row[4],
                archived_at=row[5],
                customer_id=row[6],
                customer_name=customer_name,
                customer_phone=row[9],
                template_name=row[10],
                recorded_by_name=recorded_by_name,
                value_count=row[13],
            )
        )
    return GlobalMeasurementProfileListResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total,
        total_pages=total_pages(total, page_size),
    )


async def get_measurement_profile(
    session: AsyncSession,
    business: Business,
    profile_id: uuid.UUID,
) -> MeasurementProfile:
    result = await session.execute(
        select(MeasurementProfile)
        .options(
            selectinload(MeasurementProfile.values),
            selectinload(MeasurementProfile.template),
            selectinload(MeasurementProfile.recorded_by_user),
            selectinload(MeasurementProfile.customer),
        )
        .where(MeasurementProfile.business_id == business.id, MeasurementProfile.id == profile_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Measurement profile not found"
        )
    profile.values.sort(key=lambda value: value.position)
    return profile


async def archive_measurement_profile(
    session: AsyncSession,
    business: Business,
    profile_id: uuid.UUID,
) -> MeasurementProfile:
    profile = await get_measurement_profile(session, business, profile_id)
    if profile.archived_at is None:
        profile.archived_at = datetime.now(UTC)
        await session.commit()
    return await get_measurement_profile(session, business, profile_id)


async def restore_measurement_profile(
    session: AsyncSession,
    business: Business,
    profile_id: uuid.UUID,
) -> MeasurementProfile:
    profile = await get_measurement_profile(session, business, profile_id)
    if profile.archived_at is not None:
        profile.archived_at = None
        await session.commit()
    return await get_measurement_profile(session, business, profile_id)
