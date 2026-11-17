import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as ordersApi from "../api/orders";
import type {
  CreateOrderInput,
  OrderDetail,
  OrderQueryParams,
  UpdateOrderInput,
  UpdateOrderStatusInput,
} from "../types/order";
import { invalidateDashboardQueries } from "../lib/dashboard-query";
import type { FulfillmentActionInput, FulfillmentUpdateInput } from "../types/fulfillment";

export const orderKeys = {
  lists: ["orders"] as const,
  list: (filters: OrderQueryParams) => ["orders", filters] as const,
  customerOrders: (customerId: string) =>
    ["customer-orders", customerId] as const,
  detail: (orderId: string) => ["order", orderId] as const,
};

export function useOrders(filters: OrderQueryParams) {
  return useQuery({
    queryKey: orderKeys.list(filters),
    queryFn: () => ordersApi.listOrders(filters),
  });
}

export function useCustomerOrders(customerId: string | undefined) {
  return useQuery({
    queryKey: orderKeys.customerOrders(customerId ?? ""),
    queryFn: () => ordersApi.listCustomerOrders(customerId!, { page_size: 5 }),
    enabled: Boolean(customerId),
  });
}

export function useOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: orderKeys.detail(orderId ?? ""),
    queryFn: () => ordersApi.getOrder(orderId!),
    enabled: Boolean(orderId),
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateOrderInput) => ordersApi.createOrder(payload),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.lists });
      queryClient.invalidateQueries({
        queryKey: orderKeys.customerOrders(order.customer.id),
      });
      queryClient.setQueryData(orderKeys.detail(order.id), order);
      invalidateDashboardQueries(queryClient);
    },
  });
}

export function useUpdateOrder(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateOrderInput) =>
      ordersApi.updateOrder(orderId, payload),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.lists });
      queryClient.invalidateQueries({
        queryKey: orderKeys.customerOrders(order.customer.id),
      });
      queryClient.setQueryData(orderKeys.detail(order.id), order);
      invalidateDashboardQueries(queryClient);
    },
  });
}

export function useUpdateOrderStatus(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateOrderStatusInput) =>
      ordersApi.updateOrderStatus(orderId, payload),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.lists });
      queryClient.invalidateQueries({
        queryKey: orderKeys.customerOrders(order.customer.id),
      });
      queryClient.setQueryData(orderKeys.detail(order.id), order);
      invalidateDashboardQueries(queryClient);
    },
  });
}

function useFulfillmentMutation<TInput>(
  orderId: string,
  mutationFn: (payload: TInput) => Promise<OrderDetail>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: orderKeys.lists });
      queryClient.invalidateQueries({ queryKey: orderKeys.customerOrders(order.customer.id) });
      queryClient.setQueryData(orderKeys.detail(order.id), order);
      invalidateDashboardQueries(queryClient);
    },
  });
}

export function useUpdateOrderFulfillment(orderId: string) {
  return useFulfillmentMutation(orderId, (payload: FulfillmentUpdateInput) =>
    ordersApi.updateOrderFulfillment(orderId, payload),
  );
}

export function useDispatchOrderFulfillment(orderId: string) {
  return useFulfillmentMutation(orderId, (payload: FulfillmentActionInput) =>
    ordersApi.dispatchOrderFulfillment(orderId, payload),
  );
}

export function useCompleteOrderFulfillment(orderId: string) {
  return useFulfillmentMutation(orderId, (payload: FulfillmentActionInput) =>
    ordersApi.completeOrderFulfillment(orderId, payload),
  );
}
