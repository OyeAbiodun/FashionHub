import { apiClient } from "./client";
import type {
  Customer,
  CustomerCreateInput,
  CustomerListResponse,
  CustomerQueryParams,
  CustomerUpdateInput,
} from "../types/customer";

export async function listCustomers(
  params: CustomerQueryParams,
): Promise<CustomerListResponse> {
  const response = await apiClient.get<CustomerListResponse>("/customers", {
    params,
  });
  return response.data;
}

export async function getCustomer(customerId: string): Promise<Customer> {
  const response = await apiClient.get<Customer>(`/customers/${customerId}`);
  return response.data;
}

export async function createCustomer(
  payload: CustomerCreateInput,
): Promise<Customer> {
  const response = await apiClient.post<Customer>("/customers", payload);
  return response.data;
}

export async function updateCustomer(
  customerId: string,
  payload: CustomerUpdateInput,
): Promise<Customer> {
  const response = await apiClient.patch<Customer>(
    `/customers/${customerId}`,
    payload,
  );
  return response.data;
}

export async function archiveCustomer(customerId: string): Promise<Customer> {
  const response = await apiClient.post<Customer>(
    `/customers/${customerId}/archive`,
  );
  return response.data;
}

export async function restoreCustomer(customerId: string): Promise<Customer> {
  const response = await apiClient.post<Customer>(
    `/customers/${customerId}/restore`,
  );
  return response.data;
}

export async function fetchCustomerMeasurements(customerId: string) {
  const response = await apiClient.get(`/customers/${customerId}/measurements`);
  return response.data;
}

export async function fetchCustomerOrders(customerId: string) {
  const response = await apiClient.get(`/customers/${customerId}/orders`);
  return response.data;
}
