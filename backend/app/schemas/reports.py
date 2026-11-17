from datetime import date

from pydantic import BaseModel, Field


class ReportTotals(BaseModel):
    order_count: int = 0
    customer_count: int = 0
    order_value: str = "0.00"
    collected_revenue: str = "0.00"
    outstanding_balance: str = "0.00"
    average_order_value: str = "0.00"


class ReportTrendPoint(BaseModel):
    period: str
    order_count: int = 0
    order_value: str = "0.00"
    collected_revenue: str = "0.00"


class ReportStatusCount(BaseModel):
    status: str
    count: int = 0


class ReportTopCustomer(BaseModel):
    customer_id: str
    customer_name: str
    order_count: int = 0
    collected_revenue: str = "0.00"


class BusinessReports(BaseModel):
    start_date: date
    end_date: date
    currency: str = Field(min_length=3, max_length=3)
    totals: ReportTotals
    trend: list[ReportTrendPoint]
    status_breakdown: list[ReportStatusCount]
    top_customers: list[ReportTopCustomer]
