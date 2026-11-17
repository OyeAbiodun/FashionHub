import { apiClient } from "./client";
import type { Business, BusinessSettingsInput } from "../types/auth";
import type { AdminAuditItem } from "./admin";

export async function getBusinessSettings(): Promise<Business> {
  const response = await apiClient.get<Business>("/business");
  return response.data;
}

export async function listBusinessAudit(): Promise<AdminAuditItem[]> {
  return (await apiClient.get<AdminAuditItem[]>("/business/audit")).data;
}

export async function updateBusinessSettings(
  payload: BusinessSettingsInput,
): Promise<Business> {
  const response = await apiClient.patch<Business>("/business", payload);
  return response.data;
}
