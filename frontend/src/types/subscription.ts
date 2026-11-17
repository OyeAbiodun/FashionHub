export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  monthly_price: string;
  currency: string;
  features: string[];
  max_staff_users: number;
  is_active: boolean;
}

export interface PlatformSubscriptionConfiguration {
  enabled: boolean;
  plans: SubscriptionPlan[];
  billing_provider: "MANUAL" | "STRIPE" | "PAYSTACK" | "FLUTTERWAVE";
  billing_mode: "TEST" | "LIVE";
  billing_secret_configured: boolean;
  billing_webhook_secret_configured: boolean;
  provider_credentials: Partial<Record<"STRIPE" | "PAYSTACK" | "FLUTTERWAVE", Partial<Record<"TEST" | "LIVE", { secret_configured?: boolean; webhook_secret_configured?: boolean; tested_at?: string | null }>>>>;
}

export interface PlatformSubscriptionConfigurationUpdate extends PlatformSubscriptionConfiguration {
  billing_secret?: string;
  billing_webhook_secret?: string;
}

export interface BillingProviderTestRequest {
  billing_provider: Exclude<PlatformSubscriptionConfiguration["billing_provider"], "MANUAL">;
  billing_mode: PlatformSubscriptionConfiguration["billing_mode"];
  billing_secret?: string;
}

export interface BillingProviderTestResult {
  billing_provider: BillingProviderTestRequest["billing_provider"];
  billing_mode: PlatformSubscriptionConfiguration["billing_mode"];
  connected: boolean;
  message: string;
}

export interface SubscriptionStatus {
  required: boolean;
  can_use_app: boolean;
  plans: SubscriptionPlan[];
  selected_plan: SubscriptionPlan | null;
  selected_at: string | null;
  billing_provider: "MANUAL" | "STRIPE" | "PAYSTACK" | "FLUTTERWAVE";
  billing_mode: "TEST" | "LIVE";
  subscription_status: string | null;
  period_end: string | null;
  cancel_at_period_end: boolean;
  automatic_renewal: boolean;
  can_cancel_renewal: boolean;
}

export interface SubscriptionCheckoutResponse {
  provider: string;
  reference: string;
  checkout_url: string;
}
