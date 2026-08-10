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
