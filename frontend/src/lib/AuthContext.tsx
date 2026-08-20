import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ReactNode } from "react";

import * as authApi from "../api/auth";
import { AuthContext } from "./auth-context-value";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: ["auth", "session"],
    queryFn: authApi.fetchSession,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (session) =>
      queryClient.setQueryData(["auth", "session"], session),
  });

  const registerMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: (session) =>
      queryClient.setQueryData(["auth", "session"], session),
  });

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      queryClient.clear();
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: authApi.updateUserProfile,
    onSuccess: (session) =>
      queryClient.setQueryData(["auth", "session"], session),
  });

  const session = sessionQuery.data ?? null;

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        business: session?.business ?? null,
        isAuthenticated: Boolean(session?.user),
        isLoading: sessionQuery.isLoading,
        login: loginMutation.mutateAsync,
        register: registerMutation.mutateAsync,
        logout: logoutMutation.mutateAsync,
        updateProfile: updateProfileMutation.mutateAsync,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
