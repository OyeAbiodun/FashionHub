import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_business, get_current_user, require_feature_permission
from app.core.database import get_db_session
from app.models.business import Business
from app.models.user import User
from app.models.finance import PaymentStatus
from app.schemas.finance import (
    InvoiceCreate,
    InvoiceResponse,
    PaymentCreate,
    PaymentListResponse,
    PaymentResponse,
    PaymentSummaryResponse,
)
from app.services.financial_service import (
    create_invoice,
    get_invoice,
    get_order_invoice,
    invoice_response,
    list_customer_payments,
    list_business_payments,
    get_business_payment_summary,
    list_order_payments,
    payment_response,
    record_payment,
)

router = APIRouter(tags=["payments", "invoices"])


@router.get(
    "/payments/summary",
    response_model=PaymentSummaryResponse,
    dependencies=[Depends(require_feature_permission("invoices", "invoices:read"))],
)
async def get_business_payment_summary_record(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> PaymentSummaryResponse:
    return await get_business_payment_summary(session, business)


@router.get(
    "/payments",
    response_model=PaymentListResponse,
    dependencies=[Depends(require_feature_permission("invoices", "invoices:read"))],
)
async def list_business_payment_records(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    payment_status: PaymentStatus | None = Query(default=None, alias="status"),
    start_at: datetime | None = None,
    end_at: datetime | None = None,
) -> PaymentListResponse:
    if start_at is not None and end_at is not None and start_at >= end_at:
        raise HTTPException(status_code=422, detail="start_at must be earlier than end_at")
    return await list_business_payments(
        session, business, page, page_size, payment_status, start_at, end_at
    )


@router.post(
    "/orders/{order_id}/payments",
    response_model=PaymentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_feature_permission("invoices", "invoices:write"))],
)
async def record_order_payment(
    order_id: uuid.UUID,
    payload: PaymentCreate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    current_user: Annotated[User, Depends(get_current_user)],
    request: Request,
) -> PaymentResponse:
    payment = await record_payment(session, business, current_user, order_id, payload, request)
    return payment_response(payment)


@router.get(
    "/orders/{order_id}/payments",
    response_model=list[PaymentResponse],
    dependencies=[Depends(require_feature_permission("invoices", "invoices:read"))],
)
async def list_order_payment_records(
    order_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> list[PaymentResponse]:
    return await list_order_payments(session, business, order_id)


@router.get(
    "/customers/{customer_id}/payments",
    response_model=PaymentListResponse,
    dependencies=[Depends(require_feature_permission("invoices", "invoices:read"))],
)
async def list_customer_payment_records(
    customer_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> PaymentListResponse:
    return await list_customer_payments(session, business, customer_id, page, page_size)


@router.post(
    "/orders/{order_id}/invoice",
    response_model=InvoiceResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_feature_permission("invoices", "invoices:write"))],
)
async def create_order_invoice(
    order_id: uuid.UUID,
    payload: InvoiceCreate,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> InvoiceResponse:
    invoice = await create_invoice(session, business, current_user, order_id, payload)
    return invoice_response(invoice)


@router.get(
    "/invoices/{invoice_id}",
    response_model=InvoiceResponse,
    dependencies=[Depends(require_feature_permission("invoices", "invoices:read"))],
)
async def get_invoice_record(
    invoice_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> InvoiceResponse:
    return invoice_response(await get_invoice(session, business, invoice_id))


@router.get(
    "/orders/{order_id}/invoice",
    response_model=InvoiceResponse,
    dependencies=[Depends(require_feature_permission("invoices", "invoices:read"))],
)
async def get_order_invoice_record(
    order_id: uuid.UUID,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
) -> InvoiceResponse:
    return invoice_response(await get_order_invoice(session, business, order_id))
