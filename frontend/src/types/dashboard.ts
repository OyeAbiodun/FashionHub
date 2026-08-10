import type { PaymentMethod } from "./payment";
import type { OrderStatus } from "./order";

export interface DashboardSummary {
  total_customers: number;
  active_orders: number;
  due_today: number;
  overdue_orders: number;
  ready_for_pickup: number;
  collected_this_month: string;
  outstanding_balance: string;
}

export interface DashboardOrderItem {
  id: string;
  order_number: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  status: OrderStatus;
  due_date: string;
  created_at: string;
  garment_summary: string;
  is_overdue: boolean;
  days_overdue: number;
  total: string;
  outstanding_balance: string;
}

export interface DashboardPaymentItem {
  id: string;
  order_id: string;
  order_number: string;
  customer_id: string;
  customer_name: string;
  amount: string;
  payment_method: PaymentMethod;
  paid_at: string;
  received_by_name: string;
}

export type DashboardAlertType =
  | "OVERDUE_ORDER"
  | "DUE_TODAY"
  | "READY_FOR_PICKUP"
  | "OUTSTANDING_BALANCE"
  | "UNPAID_DELIVERED";

export type DashboardAlertSeverity = "INFO" | "WARNING" | "HIGH";

export interface DashboardAlert {
  id: string;
  type: DashboardAlertType;
  severity: DashboardAlertSeverity;
  title: string;
  message: string;
  order_id: string;
  customer_id: string;
  created_from: string;
}
