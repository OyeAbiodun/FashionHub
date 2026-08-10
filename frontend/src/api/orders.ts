import { apiClient } from "./client";
import type {
  CreateOrderInput,
  OrderDetail,
  OrderListResponse,
  OrderQueryParams,
  UpdateOrderInput,
  UpdateOrderStatusInput,
} from "../types/order";

export async function listOrders(
  params: OrderQueryParams,
): Promise<OrderListResponse> {
  const response = await apiClient.get<OrderListResponse>("/orders", {
    params,
  });
  return response.data;
}

export async function listCustomerOrders(
  customerId: string,
  params: Pick<OrderQueryParams, "page" | "page_size"> = {},
): Promise<OrderListResponse> {
  const response = await apiClient.get<OrderListResponse>(
    `/customers/${customerId}/orders`,
    { params },
  );
  return response.data;
}

export async function getOrder(orderId: string): Promise<OrderDetail> {
  const response = await apiClient.get<OrderDetail>(`/orders/${orderId}`);
  return response.data;
}

export async function createOrder(
  payload: CreateOrderInput,
): Promise<OrderDetail> {
  const response = await apiClient.post<OrderDetail>("/orders", payload);
  return response.data;
}

export async function updateOrder(
  orderId: string,
  payload: UpdateOrderInput,
): Promise<OrderDetail> {
  const response = await apiClient.patch<OrderDetail>(
    `/orders/${orderId}`,
    payload,
  );
  return response.data;
}

export async function updateOrderStatus(
  orderId: string,
  payload: UpdateOrderStatusInput,
): Promise<OrderDetail> {
  const response = await apiClient.post<OrderDetail>(
    `/orders/${orderId}/status`,
    payload,
  );
  return response.data;
}
