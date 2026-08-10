import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as businessApi from "../api/business";
import { invalidateDashboardQueries } from "../lib/dashboard-query";
import type { AuthSession, BusinessSettingsInput } from "../types/auth";

export const businessKeys = {
  settings: ["business-settings"] as const,
};

export function useBusinessSettings() {
  return useQuery({
    queryKey: businessKeys.settings,
    queryFn: businessApi.getBusinessSettings,
  });
}

export function useUpdateBusinessSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: BusinessSettingsInput) =>
      businessApi.updateBusinessSettings(payload),
    onSuccess: (business) => {
      queryClient.setQueryData(businessKeys.settings, business);
      queryClient.setQueryData<AuthSession>(["auth", "session"], (session) =>
        session ? { ...session, business } : session,
      );
      invalidateDashboardQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ["invoice"] });
      queryClient.invalidateQueries({ queryKey: ["order-invoice"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order"] });
      queryClient.invalidateQueries({ queryKey: ["customer-payments"] });
    },
  });
}
