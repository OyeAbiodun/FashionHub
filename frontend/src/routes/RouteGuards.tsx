import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";

function SessionLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cloud text-sm font-medium text-ink">
      Checking your session...
    </div>
  );
}

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return <SessionLoading />;
  }
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

export function PublicOnlyRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return <SessionLoading />;
  }
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Outlet />;
}
