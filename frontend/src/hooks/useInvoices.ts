import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as invoicesApi from "../api/invoices";
import { invalidateDashboardQueries } from "../lib/dashboard-query";

export const invoiceKeys = {
  detail: (invoiceId: string) => ["invoice", invoiceId] as const,
  order: (orderId: string) => ["order-invoice", orderId] as const,
};

export function useInvoice(invoiceId: string | undefined) {
  return useQuery({
    queryKey: invoiceKeys.detail(invoiceId ?? ""),
    queryFn: () => invoicesApi.getInvoice(invoiceId!),
    enabled: Boolean(invoiceId),
  });
}

export function useOrderInvoice(orderId: string | undefined) {
  return useQuery({
    queryKey: invoiceKeys.order(orderId ?? ""),
    queryFn: () => invoicesApi.getOrderInvoice(orderId!),
    enabled: Boolean(orderId),
    retry: false,
  });
}

export function useCreateInvoice(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => invoicesApi.createInvoice(orderId),
    onSuccess: (invoice) => {
      queryClient.setQueryData(invoiceKeys.order(orderId), invoice);
      queryClient.setQueryData(invoiceKeys.detail(invoice.id), invoice);
      invalidateDashboardQueries(queryClient);
    },
  });
}
