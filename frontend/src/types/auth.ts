export type UserRole = "SUPER_ADMIN" | "BUSINESS_ADMIN" | "OWNER" | "STAFF";

export interface Business {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  address: string | null;
  logo_url: string | null;
  currency: string;
  timezone: string;
  invoice_notes: string | null;
  invoice_footer: string | null;
  enabled_features?: string[];
  max_staff_users?: number;
  is_active?: boolean;
  delivery_charges_enabled?: boolean;
  order_status_configuration?: { labels?: Record<string, string>; transitions?: Record<string, string[]> };
  audit_configuration?: { enabled?: boolean; capture_ip?: boolean; capture_device?: boolean; capture_details?: boolean };
  subscription_plan_id?: string | null;
  subscription_selected_at?: string | null;
}

export interface BusinessSettingsInput {
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  logo_url: string | null;
  currency: string;
  timezone: string;
  invoice_notes: string | null;
  invoice_footer: string | null;
  delivery_charges_enabled: boolean;
  order_status_configuration: { labels: Record<string, string>; transitions: Record<string, string[]> };
  audit_configuration: { enabled: boolean; capture_ip: boolean; capture_device: boolean; capture_details: boolean };
}

export interface User {
  id: string;
  business_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  permissions?: string[] | null;
  is_active: boolean;
}

export interface AuthSession {
  user: User;
  business: Business;
}
