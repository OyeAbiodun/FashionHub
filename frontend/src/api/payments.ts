import { apiClient } from "./client";
import type {
  CreatePaymentInput,
  Payment,
  PaymentListResponse,
} from "../types/payment";

export interface PaymentSummary {
  successful_count: number;
  successful_amount: string;
  today_count: number;
  today_amount: string;
  month_count: number;
  month_amount: string;
  pending_count: number;
  today_start: string;
  tomorrow_start: string;
  month_start: string;
  next_month_start: string;
}

export interface BusinessPaymentFilters {
  page?: number;
  page_size?: number;
  status?: Payment["status"];
  start_at?: string;
  end_at?: string;
}

export async function listOrderPayments(orderId: string): Promise<Payment[]> {
  return (await apiClient.get<Payment[]>(`/orders/${orderId}/payments`)).data;
}

export async function createOrderPayment(
  orderId: string,
  payload: CreatePaymentInput,
): Promise<Payment> {
  return (await apiClient.post<Payment>(`/orders/${orderId}/payments`, payload))
    .data;
}

export async function listCustomerPayments(
  customerId: string,
  params: { page?: number; page_size?: number } = {},
): Promise<PaymentListResponse> {
  return (
    await apiClient.get<PaymentListResponse>(
      `/customers/${customerId}/payments`,
      { params },
    )
  ).data;
}

export async function listBusinessPayments(
  params: BusinessPaymentFilters = {},
): Promise<PaymentListResponse> {
  return (await apiClient.get<PaymentListResponse>("/payments", { params })).data;
}

export async function getBusinessPaymentSummary(): Promise<PaymentSummary> {
  return (await apiClient.get<PaymentSummary>("/payments/summary")).data;
}
