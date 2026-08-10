import { apiClient } from "./client";
import type {
  CreatePaymentInput,
  Payment,
  PaymentListResponse,
} from "../types/payment";

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
