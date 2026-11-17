import type { OrderFulfillment } from "./fulfillment";

export type OrderStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "CUTTING"
  | "SEWING"
  | "FITTING"
  | "FINISHING"
  | "READY"
  | "DELIVERED"
  | "CANCELLED";

export interface OrderListItem {
  id: string;
  order_number: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  status: OrderStatus;
  order_date: string;
  due_date: string;
  item_count: number;
  garment_summary: string;
  is_overdue: boolean;
  overdue_days: number;
  created_at: string;
  total: string;
  outstanding_balance: string;
}

export interface OrderCustomerSummary {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string;
}

export interface OrderItem {
  id: string;
  garment_type: string;
  description: string | null;
  quantity: number;
  unit_price: string;
  line_total: string;
  measurement_profile_id: string | null;
  measurement_profile_name: string | null;
  style_reference_url: string | null;
  notes: string | null;
  status: OrderStatus | null;
  position: number;
}

export interface OrderStatusHistory {
  id: string;
  previous_status: OrderStatus | null;
  new_status: OrderStatus;
  changed_by: string;
  changed_by_name: string;
  notes: string | null;
  changed_at: string;
}

export interface OrderDetail {
  id: string;
  order_number: string;
  customer: OrderCustomerSummary;
  status: OrderStatus;
  order_date: string;
  due_date: string;
  notes: string | null;
  reference_image?: string | null;
  created_by: string;
  created_by_name: string;
  delivered_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
  status_history: OrderStatusHistory[];
  is_overdue: boolean;
  overdue_days: number;
  discount_amount: string;
  delivery_charge?: string;
  subtotal: string;
  total: string;
  amount_paid: string;
  outstanding_balance: string;
  financial_status: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  payment_plan?: PaymentPlan | null;
  fulfillment?: OrderFulfillment | null;
}

export interface PaymentPlan {
  advance_amount: string | null;
  advance_due_date: string | null;
  advance_paid_amount: string;
  advance_outstanding_amount: string;
  advance_status: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | null;
  installments: {
    id: string;
    amount: string;
    due_date: string;
    position: number;
    label: string;
    paid_amount: string;
    outstanding_amount: string;
    status: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";
  }[];
}

export interface CreateOrderItemInput {
  garment_type: string;
  description?: string | null;
  quantity: number;
  unit_price: string;
  measurement_profile_id?: string | null;
  style_reference_url?: string | null;
  notes?: string | null;
  reference_image?: string | null;
  position?: number | null;
}

export interface CreateOrderInput {
  customer_id: string;
  order_date: string;
  due_date: string;
  notes?: string | null;
  reference_image?: string | null;
  status?: OrderStatus;
  items: CreateOrderItemInput[];
  discount_amount: string;
  delivery_charge?: string;
  initial_payment_amount?: string | null;
  initial_payment_method?: import("./payment").PaymentMethod | null;
  payment_plan?: {
    advance_amount?: string | null;
    installments: { amount: string; due_date: string; label: string }[];
  } | null;
  fulfillment?: import("./fulfillment").FulfillmentUpdateInput | null;
}

export interface UpdateOrderInput {
  due_date?: string;
  notes?: string | null;
  reference_image?: string | null;
  discount_amount?: string;
  items?: { id: string; unit_price: string }[];
  order_date?: string;
  customer_id?: string;
  delivery_charge?: string;
  fulfillment?: import("./fulfillment").FulfillmentUpdateInput | null;
}

export interface UpdateOrderStatusInput {
  status: OrderStatus;
  notes?: string | null;
}

export interface OrderListResponse {
  items: OrderListItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface OrderQueryParams {
  search?: string;
  status?: OrderStatus | "";
  due?: "" | "today" | "tomorrow" | "this_week" | "overdue" | "upcoming";
  customer_id?: string;
  page?: number;
  page_size?: number;
}
