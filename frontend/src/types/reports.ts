export interface ReportTotals {
  order_count: number;
  customer_count: number;
  order_value: string;
  collected_revenue: string;
  outstanding_balance: string;
  average_order_value: string;
}

export interface ReportTrendPoint {
  period: string;
  order_count: number;
  order_value: string;
  collected_revenue: string;
}

export interface ReportStatusCount {
  status: string;
  count: number;
}

export interface ReportTopCustomer {
  customer_id: string;
  customer_name: string;
  order_count: number;
  collected_revenue: string;
}

export interface BusinessReports {
  start_date: string;
  end_date: string;
  currency: string;
  totals: ReportTotals;
  trend: ReportTrendPoint[];
  status_breakdown: ReportStatusCount[];
  top_customers: ReportTopCustomer[];
}
