import { useQuery } from "@tanstack/react-query";

import * as dashboardApi from "../api/dashboard";

const staleTime = 45_000;

export function useDashboardSummary() {
  return useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: dashboardApi.getDashboardSummary,
    staleTime,
  });
}

export function useDashboardDueOrders() {
  return useQuery({
    queryKey: ["dashboard-due-orders"],
    queryFn: dashboardApi.getDueOrders,
    staleTime,
  });
}

export function useDashboardRecentOrders() {
  return useQuery({
    queryKey: ["dashboard-recent-orders"],
    queryFn: dashboardApi.getRecentOrders,
    staleTime,
  });
}

export function useDashboardRecentPayments() {
  return useQuery({
    queryKey: ["dashboard-recent-payments"],
    queryFn: dashboardApi.getRecentPayments,
    staleTime,
  });
}

export function useDashboardAlerts() {
  return useQuery({
    queryKey: ["dashboard-alerts"],
    queryFn: dashboardApi.getDashboardAlerts,
    staleTime,
  });
}
