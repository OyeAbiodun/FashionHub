import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

export function resolveApiUrl(
  configuredUrl: string | undefined,
  isDevelopment: boolean,
  location: Pick<Location, "protocol" | "hostname">,
): string {
  const configured = configuredUrl?.trim().replace(/\/+$/, "");
  if (configured) {
    const parsed = new URL(configured);
    if (!isDevelopment && parsed.protocol !== "https:") {
      throw new Error("VITE_API_URL must use HTTPS in production");
    }
    return configured;
  }
  if (!isDevelopment) {
    throw new Error("VITE_API_URL must be set for production builds");
  }
  return `${location.protocol}//${location.hostname}:8000/api/v1`;
}

const baseURL = resolveApiUrl(
  import.meta.env.VITE_API_URL,
  import.meta.env.MODE === "development" || import.meta.env.MODE === "test",
  window.location,
);
const authSkipPaths = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/logout",
];

type RetryRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };
let refreshPromise: Promise<void> | null = null;

export const apiClient = axios.create({
  baseURL,
  withCredentials: true,
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryRequestConfig | undefined;
    const path = originalRequest?.url ?? "";

    if (
      error.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      authSkipPaths.some((authPath) => path.includes(authPath))
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;
    if (!refreshPromise) {
      refreshPromise = apiClient
        .post("/auth/refresh")
        .then(() => undefined)
        .finally(() => {
          refreshPromise = null;
        });
    }
    await refreshPromise;
    return apiClient(originalRequest);
  },
);

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") {
      return detail;
    }
  }
  return "Something went wrong. Please try again.";
}
