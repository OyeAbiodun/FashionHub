import { AxiosError, type AxiosAdapter, type AxiosResponse } from "axios";
import { afterEach, expect, test, vi } from "vitest";

import { apiClient, resolveApiUrl } from "./client";

const originalAdapter = apiClient.defaults.adapter;

test("the local API default uses the page hostname for same-site cookies", () => {
  expect(apiClient.defaults.baseURL).toBe("http://localhost:8000/api/v1");
});

test("production API configuration fails closed", () => {
  const location = {
    protocol: "https:",
    hostname: "app.example.com",
  } as Location;

  expect(() => resolveApiUrl(undefined, false, location)).toThrow(
    "VITE_API_URL must be set for production builds",
  );
  expect(() =>
    resolveApiUrl("http://api.example.com/api/v1", false, location),
  ).toThrow("VITE_API_URL must use HTTPS in production");
  expect(
    resolveApiUrl("https://api.example.com/api/v1/", false, location),
  ).toBe("https://api.example.com/api/v1");
});

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter;
  vi.restoreAllMocks();
});

test("concurrent 401 responses share one refresh request", async () => {
  let refreshCalls = 0;
  const adapter: AxiosAdapter = async (config) => {
    if (config.url === "/auth/refresh") {
      refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return success(config);
    }
    if ((config as typeof config & { _retry?: boolean })._retry) {
      return success(config);
    }
    throw unauthorized(config);
  };
  apiClient.defaults.adapter = adapter;

  const responses = await Promise.all([
    apiClient.get("/customers"),
    apiClient.get("/orders"),
    apiClient.get("/dashboard/summary"),
  ]);

  expect(refreshCalls).toBe(1);
  expect(responses.every((response) => response.status === 200)).toBe(true);
});

test("login 401 responses are never refreshed", async () => {
  let refreshCalls = 0;
  apiClient.defaults.adapter = async (config) => {
    if (config.url === "/auth/refresh") refreshCalls += 1;
    throw unauthorized(config);
  };

  await expect(
    apiClient.post("/auth/login", {
      email: "owner@example.com",
      password: "wrong",
    }),
  ).rejects.toBeInstanceOf(AxiosError);
  expect(refreshCalls).toBe(0);
});

function success(config: Parameters<AxiosAdapter>[0]): AxiosResponse {
  return { data: {}, status: 200, statusText: "OK", headers: {}, config };
}

function unauthorized(config: Parameters<AxiosAdapter>[0]): AxiosError {
  const response: AxiosResponse = {
    data: { detail: "Authentication required" },
    status: 401,
    statusText: "Unauthorized",
    headers: {},
    config,
  };
  return new AxiosError(
    "Request failed with status code 401",
    "ERR_BAD_REQUEST",
    config,
    undefined,
    response,
  );
}
