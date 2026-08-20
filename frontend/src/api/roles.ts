import { apiClient } from "./client";

export interface RoleItem {
  id: string;
  business_id: string | null;
  name: string;
  description: string | null;
  permissions: string[];
  is_system_role: boolean;
  created_at: string;
}

export interface RoleCreatePayload {
  name: string;
  description?: string | null;
  permissions: string[];
}

export interface RoleUpdatePayload {
  name?: string;
  description?: string | null;
  permissions?: string[];
}

export async function fetchRoles(): Promise<RoleItem[]> {
  const response = await apiClient.get<RoleItem[]>("/roles");
  return response.data;
}

export async function createCustomRole(payload: RoleCreatePayload): Promise<RoleItem> {
  const response = await apiClient.post<RoleItem>("/roles", payload);
  return response.data;
}

export async function updateCustomRole(
  roleId: string,
  payload: RoleUpdatePayload
): Promise<RoleItem> {
  const response = await apiClient.patch<RoleItem>(`/roles/${roleId}`, payload);
  return response.data;
}

export async function deleteCustomRole(roleId: string): Promise<void> {
  await apiClient.delete(`/roles/${roleId}`);
}
