import { apiClient } from "./client";
import type { AuthSession } from "../types/auth";

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  user: {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    password: string;
  };
  business: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
  };
}

export async function fetchSession(): Promise<AuthSession> {
  const response = await apiClient.get<AuthSession>("/auth/me");
  return response.data;
}

export async function login(payload: LoginPayload): Promise<AuthSession> {
  const response = await apiClient.post<AuthSession>("/auth/login", payload);
  return response.data;
}

export async function register(payload: RegisterPayload): Promise<AuthSession> {
  const response = await apiClient.post<AuthSession>("/auth/register", payload);
  return response.data;
}

export async function logout(): Promise<void> {
  await apiClient.post("/auth/logout");
}

export interface ForgotPasswordResponse {
  message: string;
  reset_token?: string | null;
}

export async function forgotPassword(
  email: string
): Promise<ForgotPasswordResponse> {
  const response = await apiClient.post<ForgotPasswordResponse>(
    "/auth/forgot-password",
    { email }
  );
  return response.data;
}

export async function resetPassword(
  token: string,
  new_password: string
): Promise<{ message: string }> {
  const response = await apiClient.post<{ message: string }>(
    "/auth/reset-password",
    { token, new_password }
  );
  return response.data;
}

export interface UpdateUserProfilePayload {
  first_name?: string;
  last_name?: string;
  phone?: string | null;
}

export async function updateUserProfile(
  payload: UpdateUserProfilePayload
): Promise<AuthSession> {
  const response = await apiClient.patch<AuthSession>("/auth/me", payload);
  return response.data;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export async function changePassword(
  payload: ChangePasswordPayload
): Promise<{ message: string }> {
  const response = await apiClient.post<{ message: string }>(
    "/auth/change-password",
    payload
  );
  return response.data;
}


