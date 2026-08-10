export type UserRole = "OWNER" | "STAFF";

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
}

export interface User {
  id: string;
  business_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
}

export interface AuthSession {
  user: User;
  business: Business;
}
