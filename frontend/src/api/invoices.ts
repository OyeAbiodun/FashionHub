import { apiClient } from "./client";
import type { Invoice } from "../types/invoice";

export async function createInvoice(orderId: string): Promise<Invoice> {
  return (await apiClient.post<Invoice>(`/orders/${orderId}/invoice`, {})).data;
}

export async function getInvoice(invoiceId: string): Promise<Invoice> {
  return (await apiClient.get<Invoice>(`/invoices/${invoiceId}`)).data;
}

export async function getOrderInvoice(orderId: string): Promise<Invoice> {
  return (await apiClient.get<Invoice>(`/orders/${orderId}/invoice`)).data;
}
