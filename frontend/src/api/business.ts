import { apiClient } from "./client";
import type { Business, BusinessSettingsInput } from "../types/auth";

export async function getBusinessSettings(): Promise<Business> {
  const response = await apiClient.get<Business>("/business");
  return response.data;
}

export async function updateBusinessSettings(
  payload: BusinessSettingsInput,
): Promise<Business> {
  const response = await apiClient.patch<Business>("/business", payload);
  return response.data;
}
