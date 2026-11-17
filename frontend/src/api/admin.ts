import { apiClient } from "./client";
import type { BillingProviderTestRequest, BillingProviderTestResult, PlatformSubscriptionConfiguration, PlatformSubscriptionConfigurationUpdate } from "../types/subscription";

export async function fetchPlatformSubscriptionConfiguration(): Promise<PlatformSubscriptionConfiguration> {
  return (await apiClient.get<PlatformSubscriptionConfiguration>("/admin/subscriptions")).data;
}

export interface PlatformSystemCheck { component: string; status: string; detail: string; action: string | null }
export interface PlatformSystemStatus {
  app_name: string; environment: string; debug: boolean; cookie_secure: boolean;
  api_status: string; database_status: string; database_dialect: string; database_name: string;
  database_host: string | null; database_server_version: string; database_size_bytes: number | null;
  database_table_count: number; database_pool: Record<string, number | null>;
  migration_revision: string | null; email_configured: boolean; email_last_test_status: string | null;
  billing_provider: string; billing_mode: string; billing_key_configured: boolean;
  billing_webhook_configured: boolean; checks: PlatformSystemCheck[];
}
export interface DatabaseQueryResult { columns: string[]; rows: Record<string, unknown>[]; row_count: number; truncated: boolean; elapsed_ms: number }
export async function fetchPlatformSystemStatus(): Promise<PlatformSystemStatus> {
  return (await apiClient.get<PlatformSystemStatus>("/admin/system/status")).data;
}
export async function runReadonlyDatabaseQuery(query: string, limit = 100): Promise<DatabaseQueryResult> {
  return (await apiClient.post<DatabaseQueryResult>("/admin/system/database-query", { query, limit })).data;
}

export async function updatePlatformSubscriptionConfiguration(payload: PlatformSubscriptionConfigurationUpdate): Promise<PlatformSubscriptionConfiguration> {
  return (await apiClient.put<PlatformSubscriptionConfiguration>("/admin/subscriptions", payload)).data;
}

export async function testBillingProviderConnection(payload: BillingProviderTestRequest): Promise<BillingProviderTestResult> {
  return (await apiClient.post<BillingProviderTestResult>("/admin/subscriptions/test-provider", payload)).data;
}

export interface PlatformMetrics {
  total_businesses: number;
  active_businesses: number;
  total_users: number;
  total_customers: number;
  total_orders: number;
  collected_by_currency: Record<string, string>;
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
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  active_user_count: number;
  audit_configuration?: Record<string, unknown>;
  subscription_plan_id?: string | null;
  subscription_selected_at?: string | null;
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
  currency?: string | null;
  amount?: string | null;
}

export interface AdminAuditItem {
  id: string;
  actor_name: string;
  actor_email: string;
  action: string;
  summary: string;
  business_id: string | null;
  business_name: string | null;
  details: Record<string, unknown>;
  source_ip: string | null;
  user_agent?: string | null;
  timestamp: string;
  currency?: string | null;
  amount?: string | null;
}

export type PlatformEmailProvider = "GMAIL" | "OUTLOOK" | "YAHOO" | "CUSTOM_SMTP";
export type SmtpSecurityMode = "STARTTLS" | "TLS" | "NONE";

export interface PlatformEmailConfiguration {
  id: string | null;
  provider: PlatformEmailProvider;
  enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string | null;
  smtp_password_configured: boolean;
  security_mode: SmtpSecurityMode;
  from_email: string | null;
  from_name: string;
  support_email?: string | null;
  support_whatsapp?: string | null;
  configured: boolean;
  last_tested_at: string | null;
  last_test_status: string | null;
}

export interface UpdatePlatformEmailPayload {
  provider: PlatformEmailProvider;
  enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string | null;
  smtp_password?: string | null;
  security_mode: SmtpSecurityMode;
  from_email: string;
  from_name: string;
  support_email?: string | null;
  support_whatsapp?: string | null;
}

export interface PlatformSupportContact { support_email: string | null; support_whatsapp: string | null }

export async function fetchPlatformSupportContact(): Promise<PlatformSupportContact> {
  return (await apiClient.get<PlatformSupportContact>("/platform/support")).data;
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

export async function fetchAdminBusiness(businessId: string): Promise<BusinessTenantDetail> {
  return (await apiClient.get<BusinessTenantDetail>(`/admin/businesses/${businessId}`)).data;
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

export async function fetchAdminAudit(params?: { limit?: number; search?: string }): Promise<AdminAuditItem[]> {
  const response = await apiClient.get<AdminAuditItem[]>("/admin/audit", { params });
  return response.data;
}

export interface AuditCaptureConfiguration { enabled: boolean; capture_ip: boolean; capture_device: boolean; capture_details: boolean }

export async function fetchPlatformAuditConfiguration(): Promise<AuditCaptureConfiguration> {
  return (await apiClient.get<AuditCaptureConfiguration>("/admin/audit/configuration")).data;
}

export async function updatePlatformAuditConfiguration(payload: AuditCaptureConfiguration): Promise<AuditCaptureConfiguration> {
  return (await apiClient.put<AuditCaptureConfiguration>("/admin/audit/configuration", payload)).data;
}

export async function fetchPlatformEmailConfiguration(): Promise<PlatformEmailConfiguration> {
  const response = await apiClient.get<PlatformEmailConfiguration>("/platform/email");
  return response.data;
}

export async function updatePlatformEmailConfiguration(
  payload: UpdatePlatformEmailPayload
): Promise<PlatformEmailConfiguration> {
  const response = await apiClient.put<PlatformEmailConfiguration>("/platform/email", payload);
  return response.data;
}

export async function sendPlatformEmailTest(recipient: string): Promise<{ message: string }> {
  const response = await apiClient.post<{ message: string }>("/platform/email/test", { recipient });
  return response.data;
}
