import type { QueryClient } from "@tanstack/react-query";

export const dashboardQueryKeys = [
  ["dashboard-summary"],
  ["dashboard-due-orders"],
  ["dashboard-recent-orders"],
  ["dashboard-recent-payments"],
  ["dashboard-alerts"],
] as const;

export function invalidateDashboardQueries(queryClient: QueryClient) {
  for (const queryKey of dashboardQueryKeys) {
    queryClient.invalidateQueries({ queryKey });
  }
}
