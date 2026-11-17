import { apiClient } from "./client";
import type { SubscriptionCheckoutResponse, SubscriptionStatus } from "../types/subscription";

export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  return (await apiClient.get<SubscriptionStatus>("/subscription/status")).data;
}

export async function selectSubscriptionPlan(planId: string): Promise<SubscriptionStatus> {
  return (await apiClient.post<SubscriptionStatus>("/subscription/select", { plan_id: planId })).data;
}

export async function startSubscriptionCheckout(planId: string): Promise<SubscriptionCheckoutResponse> {
  return (await apiClient.post<SubscriptionCheckoutResponse>("/subscription/checkout", { plan_id: planId })).data;
}

export async function verifySubscriptionCheckout(payload: { reference: string; transaction_id?: string; checkout_session_id?: string }) {
  return (await apiClient.post("/subscription/checkout/verify", payload)).data;
}

export async function getSubscriptionPayments() {
  return (await apiClient.get<Array<{ status: string; plan_id: string; plan_name: string; amount: string; currency: string; provider: string; reference: string; period_end: string | null; created_at: string | null; cancel_at_period_end: boolean }>>("/subscription/payments")).data;
}

export async function cancelSubscriptionRenewal(): Promise<SubscriptionStatus> {
  return (await apiClient.post<SubscriptionStatus>("/subscription/cancel")).data;
}
