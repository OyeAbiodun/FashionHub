import { createContext } from "react";

import type { AuthSession } from "../types/auth";
import type { LoginPayload, RegisterPayload } from "../api/auth";

interface AuthContextValue {
  user: AuthSession["user"] | null;
  business: AuthSession["business"] | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<AuthSession>;
  register: (payload: RegisterPayload) => Promise<AuthSession>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
