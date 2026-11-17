import type { Payment } from "./payment";

export type InvoiceStatus =
  "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";

export interface InvoiceItem {
  garment_type: string;
  description: string | null;
  quantity: number;
  unit_price: string;
  line_total: string;
}

export interface InvoiceFinancialSummary {
  subtotal: string;
  discount_amount: string;
  delivery_charge?: string;
  total: string;
  amount_paid: string;
  outstanding_balance: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  status: InvoiceStatus;
  issued_at: string;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  business: {
    name: string;
    phone: string;
    email: string | null;
    address: string | null;
    logo_url: string | null;
    currency: string;
    timezone: string;
    invoice_notes: string | null;
    invoice_footer: string | null;
  };
  customer: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    address: string | null;
  };
  order: {
    id: string;
    order_number: string;
    order_date: string;
    due_date: string;
  };
  items: InvoiceItem[];
  financial_summary: InvoiceFinancialSummary;
  payments: Payment[];
}
