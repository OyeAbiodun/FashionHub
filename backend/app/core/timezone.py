from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.models.business import Business

DEFAULT_BUSINESS_TIMEZONE = "Africa/Lagos"


def business_timezone(business: Business) -> ZoneInfo:
    try:
        return ZoneInfo(business.timezone)
    except ZoneInfoNotFoundError:
        return ZoneInfo(DEFAULT_BUSINESS_TIMEZONE)


def business_now(business: Business) -> datetime:
    return datetime.now(business_timezone(business))


def business_today(business: Business) -> date:
    return business_now(business).date()


def current_month_utc_bounds(business: Business) -> tuple[datetime, datetime]:
    local_now = business_now(business)
    month_start = local_now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if month_start.month == 12:
        next_month = month_start.replace(year=month_start.year + 1, month=1)
    else:
        next_month = month_start.replace(month=month_start.month + 1)
    return month_start.astimezone(UTC), next_month.astimezone(UTC)
