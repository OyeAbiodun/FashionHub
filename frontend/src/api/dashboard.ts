import { apiClient } from "./client";
import type {
  DashboardAlert,
  DashboardOrderItem,
  DashboardPaymentItem,
  DashboardSummary,
} from "../types/dashboard";

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return (await apiClient.get<DashboardSummary>("/dashboard/summary")).data;
}

export async function getDueOrders(): Promise<DashboardOrderItem[]> {
  return (await apiClient.get<DashboardOrderItem[]>("/dashboard/due-orders"))
    .data;
}

export async function getRecentOrders(): Promise<DashboardOrderItem[]> {
  return (await apiClient.get<DashboardOrderItem[]>("/dashboard/recent-orders"))
    .data;
}

export async function getRecentPayments(): Promise<DashboardPaymentItem[]> {
  return (
    await apiClient.get<DashboardPaymentItem[]>("/dashboard/recent-payments")
  ).data;
}

export async function getDashboardAlerts(): Promise<DashboardAlert[]> {
  return (await apiClient.get<DashboardAlert[]>("/dashboard/alerts")).data;
}
