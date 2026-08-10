export type PaymentMethod = "CASH" | "TRANSFER" | "CARD" | "POS" | "OTHER";
export type PaymentStatus = "PENDING" | "SUCCESSFUL" | "FAILED" | "REFUNDED";

export interface Payment {
  id: string;
  order_id: string;
  customer_id: string;
  amount: string;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  reference: string | null;
  notes: string | null;
  received_by: string;
  received_by_name: string;
  paid_at: string;
  created_at: string;
}

export interface PaymentListItem extends Payment {
  order_number: string;
}

export interface PaymentListResponse {
  items: PaymentListItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface CreatePaymentInput {
  amount: string;
  payment_method: PaymentMethod;
  reference?: string | null;
  notes?: string | null;
  paid_at?: string | null;
}
