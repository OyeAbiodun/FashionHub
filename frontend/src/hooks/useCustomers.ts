import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as customersApi from "../api/customers";
import type {
  CustomerCreateInput,
  CustomerQueryParams,
  CustomerUpdateInput,
} from "../types/customer";
import { invalidateDashboardQueries } from "../lib/dashboard-query";

export const customerKeys = {
  lists: ["customers"] as const,
  list: (filters: CustomerQueryParams) => ["customers", filters] as const,
  detail: (customerId: string) => ["customer", customerId] as const,
};

export function useCustomers(filters: CustomerQueryParams, enabled = true) {
  return useQuery({
    queryKey: customerKeys.list(filters),
    queryFn: () => customersApi.listCustomers(filters),
    enabled,
  });
}

export function useCustomer(customerId: string | undefined) {
  return useQuery({
    queryKey: customerKeys.detail(customerId ?? ""),
    queryFn: () => customersApi.getCustomer(customerId!),
    enabled: Boolean(customerId),
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CustomerCreateInput) =>
      customersApi.createCustomer(payload),
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.lists });
      queryClient.setQueryData(customerKeys.detail(customer.id), customer);
      invalidateDashboardQueries(queryClient);
    },
  });
}

export function useUpdateCustomer(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CustomerUpdateInput) =>
      customersApi.updateCustomer(customerId, payload),
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.lists });
      queryClient.setQueryData(customerKeys.detail(customer.id), customer);
      invalidateDashboardQueries(queryClient);
    },
  });
}

export function useArchiveCustomer(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => customersApi.archiveCustomer(customerId),
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.lists });
      queryClient.setQueryData(customerKeys.detail(customer.id), customer);
      invalidateDashboardQueries(queryClient);
    },
  });
}

export function useRestoreCustomer(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => customersApi.restoreCustomer(customerId),
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: customerKeys.lists });
      queryClient.setQueryData(customerKeys.detail(customer.id), customer);
      invalidateDashboardQueries(queryClient);
    },
  });
}
