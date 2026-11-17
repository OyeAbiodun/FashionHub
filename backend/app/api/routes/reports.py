from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_business, require_feature_permission
from app.core.database import get_db_session
from app.models.business import Business
from app.schemas.reports import BusinessReports
from app.services.reports_service import get_business_reports

router = APIRouter(
    prefix="/reports",
    tags=["reports"],
    dependencies=[Depends(require_feature_permission("reports", "reports:read"))],
)


@router.get("/summary", response_model=BusinessReports)
async def business_report_summary(
    session: Annotated[AsyncSession, Depends(get_db_session)],
    business: Annotated[Business, Depends(get_current_business)],
    start_date: Annotated[date, Query()],
    end_date: Annotated[date, Query()],
) -> BusinessReports:
    if end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="End date must be on or after start date.",
        )
    if (end_date - start_date).days > 730:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Report date range cannot exceed 24 months.",
        )
    return await get_business_reports(session, business, start_date, end_date)
