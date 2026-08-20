import { apiClient } from "./client";

export interface PlatformMetrics {
  total_businesses: number;
  active_businesses: number;
  total_users: number;
  total_customers: number;
  total_orders: number;
  total_revenue: string;
}

export interface BusinessTenantDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  address: string | null;
  logo_url: string | null;
  currency: string;
  timezone: string;
  enabled_features: string[];
  max_staff_users: number;
  is_active: boolean;
  created_at: string;
  user_count: number;
  customer_count: number;
  order_count: number;
  total_revenue: string;
}

export interface AdminBusinessesResponse {
  items: BusinessTenantDetail[];
  total: number;
  page: number;
  page_size: number;
}

export interface PlatformActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  business_name: string;
  timestamp: string;
}

export async function fetchPlatformMetrics(): Promise<PlatformMetrics> {
  const response = await apiClient.get<PlatformMetrics>("/admin/metrics");
  return response.data;
}

export async function fetchAdminBusinesses(params?: {
  search?: string;
  page?: number;
  page_size?: number;
  active_only?: boolean;
}): Promise<AdminBusinessesResponse> {
  const response = await apiClient.get<AdminBusinessesResponse>("/admin/businesses", {
    params,
  });
  return response.data;
}

export async function updateBusinessEntitlements(
  businessId: string,
  payload: { enabled_features: string[]; max_staff_users: number }
): Promise<BusinessTenantDetail> {
  const response = await apiClient.patch<BusinessTenantDetail>(
    `/admin/businesses/${businessId}/entitlements`,
    payload
  );
  return response.data;
}

export async function toggleBusinessActive(
  businessId: string
): Promise<BusinessTenantDetail> {
  const response = await apiClient.post<BusinessTenantDetail>(
    `/admin/businesses/${businessId}/toggle-active`
  );
  return response.data;
}

export async function fetchPlatformActivity(): Promise<PlatformActivityItem[]> {
  const response = await apiClient.get<PlatformActivityItem[]>("/admin/activity");
  return response.data;
}
