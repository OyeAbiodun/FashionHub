import { apiClient } from "./client";
import type { AuthSession } from "../types/auth";

export interface StaffMember {
  id: string;
  membership_id?: string | null;
  business_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role: "SUPER_ADMIN" | "BUSINESS_ADMIN" | "OWNER" | "STAFF";
  permissions: string[] | null;
  is_active: boolean;
}

export interface StaffInvitationCreatePayload {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  role: "BUSINESS_ADMIN" | "STAFF";
  permissions?: string[] | null;
  custom_role_id?: string | null;
}

export interface StaffInvitation extends StaffInvitationCreatePayload {
  id: string;
  business_id: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expires_at: string;
  created_at: string;
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

export async function addStaffMember(payload: StaffInvitationCreatePayload): Promise<StaffInvitation> {
  const response = await apiClient.post<StaffInvitation>("/team", payload);
  return response.data;
}

export async function fetchTeamInvitations(): Promise<StaffInvitation[]> {
  const response = await apiClient.get<StaffInvitation[]>("/team/invitations");
  return response.data;
}

export async function revokeTeamInvitation(invitationId: string): Promise<StaffInvitation> {
  const response = await apiClient.delete<StaffInvitation>(`/team/invitations/${invitationId}`);
  return response.data;
}

export async function resendTeamInvitation(invitationId: string): Promise<StaffInvitation> {
  const response = await apiClient.post<StaffInvitation>(`/team/invitations/${invitationId}/resend`);
  return response.data;
}

export async function acceptTeamInvitation(payload: { token: string; password: string }): Promise<AuthSession> {
  const response = await apiClient.post<AuthSession>("/team/invitations/accept", payload);
  return response.data;
}

export async function updateStaffMember(
  userId: string,
  payload: StaffUpdatePayload
): Promise<StaffMember> {
  const response = await apiClient.patch<StaffMember>(`/team/${userId}`, payload);
  return response.data;
}
