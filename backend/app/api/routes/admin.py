import re
import time
import uuid
from typing import Annotated
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_super_admin
from app.core.config import Settings, get_settings
from app.core.database import engine, get_db_session
from app.models.platform_email import PlatformEmailConfiguration
from app.models.platform_subscription import (
    PlatformSubscriptionConfiguration as SubscriptionConfigModel,
)
from app.models.user import User
from app.schemas.admin import (
    AdminAuditItem,
    AuditCaptureConfiguration,
    BusinessTenantDetail,
    DatabaseQueryRequest,
    DatabaseQueryResult,
    PlatformActivityItem,
    PlatformMetrics,
    PlatformSystemStatus,
    SystemCheck,
    UpdateBusinessEntitlements,
)
from app.schemas.subscription import (
    BillingProviderTestRequest,
    BillingProviderTestResult,
    PlatformSubscriptionConfiguration,
    PlatformSubscriptionConfigurationUpdate,
)
from app.services.admin_service import (
    get_business_tenant_detail,
    get_platform_audit_configuration,
    get_platform_metrics,
    get_recent_platform_activity,
    list_admin_audit,
    list_all_businesses,
    record_admin_action,
    toggle_business_active,
    update_business_entitlements,
    update_platform_audit_configuration,
)
from app.services.subscription_service import (
    get_configuration,
    save_configuration,
    test_billing_provider_connection,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/system/status", response_model=PlatformSystemStatus)
async def get_system_status(
    _: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> PlatformSystemStatus:
    database_engine = session.bind or engine
    parsed_db = urlsplit(settings.database_url)
    dialect = database_engine.dialect.name
    database_name = parsed_db.path.lstrip("/") or "unknown"
    server_version, database_size, table_count, revision = "unknown", None, 0, None
    try:
        async with database_engine.connect() as connection:
            if dialect == "postgresql":
                database_name, server_version, database_size = (
                    await connection.execute(
                        text(
                            "SELECT current_database(), current_setting('server_version'), "
                            "pg_database_size(current_database())"
                        )
                    )
                ).one()
                table_count = int(
                    await connection.scalar(
                        text(
                            "SELECT count(*) FROM information_schema.tables "
                            "WHERE table_schema='public' AND table_type='BASE TABLE'"
                        )
                    )
                    or 0
                )
            else:
                server_version = str(
                    await connection.scalar(text("SELECT sqlite_version()")) or "SQLite"
                )
                table_count = int(
                    await connection.scalar(
                        text(
                            "SELECT count(*) FROM sqlite_master "
                            "WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                        )
                    )
                    or 0
                )
            try:
                revision = await connection.scalar(
                    text("SELECT version_num FROM alembic_version LIMIT 1")
                )
            except SQLAlchemyError:
                await connection.rollback()
            await connection.execute(text("SELECT 1"))
        database_reachable = True
    except SQLAlchemyError:
        database_reachable = False

    email = await session.scalar(
        select(PlatformEmailConfiguration).where(
            PlatformEmailConfiguration.config_key == "platform"
        )
    )
    email_configured = bool(
        email and email.enabled and email.smtp_password_encrypted and email.smtp_username
    )
    config = await session.get(SubscriptionConfigModel, 1)
    provider, mode = (
        (config.billing_provider, config.billing_mode) if config else ("MANUAL", "TEST")
    )
    credentials = (
        config.provider_credentials
        if config and isinstance(config.provider_credentials, dict)
        else {}
    )
    entry = credentials.get(provider, {}).get(mode, {})
    key_configured = bool(
        entry.get("secret_encrypted") or (config and config.billing_secret_encrypted)
    )
    webhook_configured = bool(
        entry.get("webhook_secret_encrypted")
        or (config and config.billing_webhook_secret_encrypted)
    )
    checks = [
        SystemCheck(
            component="API process",
            status="HEALTHY",
            detail=f"{settings.app_name} API is responding.",
        ),
        SystemCheck(
            component="Database",
            status="HEALTHY" if database_reachable else "FAILED",
            detail=f"{dialect} · {database_name}"
            if database_reachable
            else "Database connection failed.",
            action="Retry check",
        ),
        SystemCheck(
            component="Migrations",
            status="HEALTHY" if revision else "WARNING",
            detail=f"Current revision: {revision or 'not available'}",
            action="View migrations",
        ),
        SystemCheck(
            component="Platform email",
            status="HEALTHY"
            if email_configured and email.last_test_status == "SUCCESS"
            else "WARNING",
            detail="Configured and recently tested."
            if email_configured and email.last_test_status == "SUCCESS"
            else "Not configured or not successfully tested.",
            action="Platform Settings",
        ),
        SystemCheck(
            component="Subscription billing",
            status="HEALTHY"
            if provider != "MANUAL" and key_configured and webhook_configured
            else "WARNING",
            detail=(
                f"{provider} · {mode}; provider key and webhook "
                f"{'configured' if key_configured and webhook_configured else 'incomplete'}."
            ),
            action="Subscriptions",
        ),
        SystemCheck(
            component="Scheduled jobs",
            status="WARNING",
            detail=(
                "No background worker is configured. Reminder candidates are available in the app "
                "but are not dispatched automatically."
            ),
        ),
    ]
    if settings.app_env.lower() == "production":
        encryption_ready = bool(
            settings.platform_email_encryption_key
            and len(settings.platform_email_encryption_key) >= 32
        )
        https_ready = settings.frontend_origin.startswith("https://")
        checks.extend(
            [
                SystemCheck(
                    component="Production debug mode",
                    status="HEALTHY" if not settings.debug else "FAILED",
                    detail="Debug mode is disabled."
                    if not settings.debug
                    else "Debug mode must be disabled in production.",
                ),
                SystemCheck(
                    component="Secure cookies",
                    status="HEALTHY" if settings.cookie_secure else "FAILED",
                    detail="Secure cookies are enabled."
                    if settings.cookie_secure
                    else "Secure cookies are disabled.",
                ),
                SystemCheck(
                    component="Credential encryption",
                    status="HEALTHY" if encryption_ready else "FAILED",
                    detail="Platform secret encryption is configured."
                    if encryption_ready
                    else "Encryption key is missing or too short.",
                ),
                SystemCheck(
                    component="Public HTTPS origin",
                    status="HEALTHY" if https_ready else "FAILED",
                    detail="The frontend origin uses HTTPS."
                    if https_ready
                    else "FRONTEND_URL must use HTTPS in production.",
                ),
            ]
        )
    pool = database_engine.pool
    try:
        pool_info = {
            "size": pool.size(),
            "checked_out": pool.checkedout(),
            "overflow": pool.overflow(),
        }
    except (AttributeError, TypeError):
        pool_info = {"size": None, "checked_out": None, "overflow": None}
    return PlatformSystemStatus(
        app_name=settings.app_name,
        environment=settings.app_env,
        debug=settings.debug,
        cookie_secure=settings.cookie_secure,
        api_status="HEALTHY",
        database_status="HEALTHY" if database_reachable else "FAILED",
        database_dialect=dialect,
        database_name=str(database_name),
        database_host=parsed_db.hostname,
        database_server_version=str(server_version),
        database_size_bytes=int(database_size) if database_size is not None else None,
        database_table_count=table_count,
        database_pool=pool_info,
        migration_revision=str(revision) if revision else None,
        email_configured=email_configured,
        email_last_test_status=email.last_test_status if email else None,
        billing_provider=provider,
        billing_mode=mode,
        billing_key_configured=key_configured,
        billing_webhook_configured=webhook_configured,
        checks=checks,
    )


@router.post("/system/database-query", response_model=DatabaseQueryResult)
async def query_database_readonly(
    payload: DatabaseQueryRequest,
    actor: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
) -> DatabaseQueryResult:
    query = payload.query.strip()
    blocked = re.compile(
        r"\b(with|insert|update|delete|merge|drop|alter|create|truncate|grant|revoke|copy|call|execute|vacuum|attach|detach|pragma|dblink|lo_export|lo_import|nextval|setval|set_config|current_setting|information_schema|pg_catalog|pg_[a-z0-9_]*|users|password_reset_tokens|password_reset_requests|platform_email_configurations|platform_subscription_configurations|business_subscriptions|business_invitations)\b|--|/\*|\*/|;",
        re.IGNORECASE,
    )
    if not re.match(r"^select\b", query, re.IGNORECASE) or blocked.search(query):
        raise HTTPException(
            status_code=422,
            detail=(
                "Only a single read-only SELECT is permitted. Sensitive tables and database "
                "control functions are blocked."
            ),
        )
    started = time.perf_counter()
    database_engine = session.bind or engine
    try:
        async with database_engine.connect() as connection:
            async with connection.begin():
                if database_engine.dialect.name == "postgresql":
                    await connection.execute(text("SET TRANSACTION READ ONLY"))
                    await connection.execute(text("SET LOCAL statement_timeout = '5s'"))
                elif database_engine.dialect.name == "sqlite":
                    await connection.execute(text("PRAGMA query_only = ON"))
                result = await connection.execute(
                    text(f"SELECT * FROM ({query}) AS admin_readonly_query LIMIT :row_limit"),
                    {"row_limit": payload.limit + 1},
                )
                columns = list(result.keys())
                raw_rows = result.mappings().all()
                truncated = len(raw_rows) > payload.limit
                rows = [jsonable_encoder(dict(row)) for row in raw_rows[: payload.limit]]
            if database_engine.dialect.name == "sqlite":
                await connection.execute(text("PRAGMA query_only = OFF"))
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=422, detail="The query failed or exceeded the safe execution limit."
        ) from exc
    await record_admin_action(
        session,
        actor,
        "PLATFORM_DATABASE_QUERY",
        "Ran a read-only database query",
        details={"query_length": len(query), "row_count": len(rows), "truncated": truncated},
        request=request,
    )
    await session.commit()
    return DatabaseQueryResult(
        columns=columns,
        rows=rows,
        row_count=len(rows),
        truncated=truncated,
        elapsed_ms=round((time.perf_counter() - started) * 1000),
    )


@router.get("/subscriptions", response_model=PlatformSubscriptionConfiguration)
async def get_subscription_configuration(
    _: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PlatformSubscriptionConfiguration:
    return await get_configuration(session)


@router.put("/subscriptions", response_model=PlatformSubscriptionConfiguration)
async def put_subscription_configuration(
    payload: PlatformSubscriptionConfigurationUpdate,
    actor: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    request: Request,
) -> PlatformSubscriptionConfiguration:
    return await save_configuration(session, payload, actor, settings, request)


@router.post("/subscriptions/test-provider", response_model=BillingProviderTestResult)
async def post_subscription_provider_test(
    payload: BillingProviderTestRequest,
    actor: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    request: Request,
) -> BillingProviderTestResult:
    return await test_billing_provider_connection(session, payload, actor, settings, request)


@router.get("/audit/configuration", response_model=AuditCaptureConfiguration)
async def get_audit_configuration(
    _: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> AuditCaptureConfiguration:
    return AuditCaptureConfiguration(**(await get_platform_audit_configuration(session)))


@router.put("/audit/configuration", response_model=AuditCaptureConfiguration)
async def put_audit_configuration(
    payload: AuditCaptureConfiguration,
    actor: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
) -> AuditCaptureConfiguration:
    result = await update_platform_audit_configuration(session, payload.model_dump())
    await record_admin_action(
        session,
        actor,
        "PLATFORM_AUDIT_CONFIGURATION_UPDATED",
        "Updated platform audit capture settings",
        details=payload.model_dump(),
        request=request,
    )
    await session.commit()
    return AuditCaptureConfiguration(**result)


@router.get("/metrics", response_model=PlatformMetrics)
async def get_metrics(
    _: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PlatformMetrics:
    return await get_platform_metrics(session)


@router.get("/businesses")
async def get_businesses(
    _: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    search: Annotated[str | None, Query(max_length=200)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    active_only: bool = False,
):
    items, total_count = await list_all_businesses(
        session, search=search, page=page, page_size=page_size, active_only=active_only
    )
    return {
        "items": items,
        "total": total_count,
        "page": page,
        "page_size": page_size,
    }


@router.get("/businesses/{business_id}", response_model=BusinessTenantDetail)
async def get_business(
    business_id: uuid.UUID,
    _: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> BusinessTenantDetail:
    return await get_business_tenant_detail(session, business_id)


@router.patch("/businesses/{business_id}/entitlements", response_model=BusinessTenantDetail)
async def update_entitlements(
    business_id: uuid.UUID,
    payload: UpdateBusinessEntitlements,
    actor: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
) -> BusinessTenantDetail:
    return await update_business_entitlements(session, business_id, payload, actor, request)


@router.post("/businesses/{business_id}/toggle-active", response_model=BusinessTenantDetail)
async def toggle_active(
    business_id: uuid.UUID,
    actor: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    request: Request,
) -> BusinessTenantDetail:
    return await toggle_business_active(session, business_id, actor, request)


@router.get("/activity", response_model=list[PlatformActivityItem])
async def get_activity(
    _: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[PlatformActivityItem]:
    return await get_recent_platform_activity(session, limit=limit)


@router.get("/audit", response_model=list[AdminAuditItem])
async def get_audit(
    _: Annotated[User, Depends(get_current_super_admin)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    search: Annotated[str | None, Query(max_length=200)] = None,
) -> list[AdminAuditItem]:
    return await list_admin_audit(session, limit=limit, search=search)
