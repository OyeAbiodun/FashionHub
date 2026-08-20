import { apiClient } from "./client";

export interface StaffMember {
  id: string;
  business_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role: "SUPER_ADMIN" | "BUSINESS_ADMIN" | "OWNER" | "STAFF";
  permissions: string[] | null;
  is_active: boolean;
}

export interface StaffCreatePayload {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  password: string;
  role: "BUSINESS_ADMIN" | "STAFF";
  permissions?: string[] | null;
}

export interface StaffUpdatePayload {
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  role?: "BUSINESS_ADMIN" | "STAFF";
  permissions?: string[] | null;
  is_active?: boolean;
}

export async function fetchTeamMembers(): Promise<StaffMember[]> {
  const response = await apiClient.get<StaffMember[]>("/team");
  return response.data;
}

export async function addStaffMember(payload: StaffCreatePayload): Promise<StaffMember> {
  const response = await apiClient.post<StaffMember>("/team", payload);
  return response.data;
}

export async function updateStaffMember(
  userId: string,
  payload: StaffUpdatePayload
): Promise<StaffMember> {
  const response = await apiClient.patch<StaffMember>(`/team/${userId}`, payload);
  return response.data;
}
