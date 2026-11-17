import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as paymentsApi from "../api/payments";
import type { BusinessPaymentFilters } from "../api/payments";
import { invoiceKeys } from "./useInvoices";
import { orderKeys } from "./useOrders";
import type { CreatePaymentInput } from "../types/payment";
import { invalidateDashboardQueries } from "../lib/dashboard-query";

export const paymentKeys = {
  order: (orderId: string) => ["order-payments", orderId] as const,
  customer: (customerId: string, page: number) =>
    ["customer-payments", customerId, { page }] as const,
  business: (filters: BusinessPaymentFilters) => ["payments", filters] as const,
  businessSummary: ["payments", "summary"] as const,
};

export function useOrderPayments(orderId: string | undefined) {
  return useQuery({
    queryKey: paymentKeys.order(orderId ?? ""),
    queryFn: () => paymentsApi.listOrderPayments(orderId!),
    enabled: Boolean(orderId),
  });
}

export function useBusinessPayments(filters: BusinessPaymentFilters = { page: 1, page_size: 20 }) {
  return useQuery({
    queryKey: paymentKeys.business(filters),
    queryFn: () => paymentsApi.listBusinessPayments({ page: 1, page_size: 20, ...filters }),
  });
}

export function useBusinessPaymentSummary() {
  return useQuery({
    queryKey: paymentKeys.businessSummary,
    queryFn: paymentsApi.getBusinessPaymentSummary,
  });
}

export function useCustomerPayments(customerId: string | undefined, page = 1) {
  return useQuery({
    queryKey: paymentKeys.customer(customerId ?? "", page),
    queryFn: () =>
      paymentsApi.listCustomerPayments(customerId!, { page, page_size: 5 }),
    enabled: Boolean(customerId),
  });
}

export function useCreatePayment(orderId: string, customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePaymentInput) =>
      paymentsApi.createOrderPayment(orderId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orderKeys.lists });
      queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
      queryClient.invalidateQueries({ queryKey: paymentKeys.order(orderId) });
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({
        queryKey: ["customer-payments", customerId],
      });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.order(orderId) });
      queryClient.invalidateQueries({ queryKey: ["invoice"] });
      invalidateDashboardQueries(queryClient);
    },
  });
}
