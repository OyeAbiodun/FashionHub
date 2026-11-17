import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { getSubscriptionStatus } from "../api/subscription";
import { InlineError, PageContainer, Skeleton } from "../components/ui";
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

export function SuperAdminRoute() {
  const { user, isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return <SessionLoading />;
  }
  if (!isAuthenticated || user?.role !== "SUPER_ADMIN") {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}

export function SubscriptionGate() {
  const { user } = useAuth();
  const location = useLocation();
  const { refetch, ...status } = useQuery({
    queryKey: ["subscription", "status"],
    queryFn: getSubscriptionStatus,
    enabled: user?.role !== "SUPER_ADMIN",
    retry: false,
  });
  useEffect(() => {
    if (user?.role !== "SUPER_ADMIN") void refetch();
  }, [location.pathname, refetch, user?.role]);

  if (user?.role === "SUPER_ADMIN") return <Outlet />;
  if (status.isLoading) {
    return <PageContainer><Skeleton className="mx-auto mt-20 h-40 max-w-3xl" /></PageContainer>;
  }
  if (status.isError || !status.data) {
    return <PageContainer><div className="mx-auto mt-20 max-w-xl"><InlineError message="Your subscription access could not be checked. Refresh and try again." retry={() => void refetch()} /></div></PageContainer>;
  }
  const isSubscriptionPage = location.pathname === "/subscription";
  if (status.data.required && !status.data.can_use_app && !isSubscriptionPage) {
    return <Navigate to="/subscription" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
