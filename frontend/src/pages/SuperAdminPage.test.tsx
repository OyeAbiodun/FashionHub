import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import * as adminApi from "../api/admin";
import { renderWithAuth } from "../test/render";
import { SuperAdminPage } from "./SuperAdminPage";

vi.mock("../api/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof adminApi>();
  return {
    ...actual,
    fetchPlatformMetrics: vi.fn(),
    fetchAdminBusinesses: vi.fn(),
    fetchPlatformActivity: vi.fn(),
    updateBusinessEntitlements: vi.fn(),
    toggleBusinessActive: vi.fn(),
  };
});

describe("SuperAdminPage", () => {
  it("renders platform metrics and tenant directory table", async () => {
    vi.mocked(adminApi.fetchPlatformMetrics).mockResolvedValueOnce({
      total_businesses: 5,
      active_businesses: 4,
      total_users: 12,
      total_customers: 50,
      total_orders: 25,
      total_revenue: "150000.00",
    });

    vi.mocked(adminApi.fetchAdminBusinesses).mockResolvedValueOnce({
      items: [
        {
          id: "bus-1",
          name: "Lagos Bespoke Studio",
          email: "owner@lagos.ng",
          phone: "+2348011112222",
          address: "Lagos",
          logo_url: null,
          currency: "NGN",
          timezone: "Africa/Lagos",
          enabled_features: ["customers", "orders", "measurements"],
          max_staff_users: 10,
          is_active: true,
          created_at: new Date().toISOString(),
          user_count: 2,
          customer_count: 15,
          order_count: 8,
          total_revenue: "45000.00",
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
    });

    vi.mocked(adminApi.fetchPlatformActivity).mockResolvedValueOnce([]);

    renderWithAuth(<SuperAdminPage />, { authenticated: true, route: "/admin" });

    expect(screen.getByText("Super Admin Control Center")).toBeInTheDocument();
    expect(await screen.findByText("Lagos Bespoke Studio")).toBeInTheDocument();
    expect(screen.getByText("₦150000.00")).toBeInTheDocument();
  });

  it("opens entitlements editor dialog and saves updated features", async () => {
    const user = userEvent.setup();

    vi.mocked(adminApi.fetchPlatformMetrics).mockResolvedValueOnce({
      total_businesses: 1,
      active_businesses: 1,
      total_users: 2,
      total_customers: 5,
      total_orders: 3,
      total_revenue: "20000.00",
    });

    vi.mocked(adminApi.fetchAdminBusinesses).mockResolvedValueOnce({
      items: [
        {
          id: "bus-1",
          name: "Abuja Tailors",
          email: "owner@abuja.ng",
          phone: "+2348099998888",
          address: "Abuja",
          logo_url: null,
          currency: "NGN",
          timezone: "Africa/Lagos",
          enabled_features: ["customers"],
          max_staff_users: 5,
          is_active: true,
          created_at: new Date().toISOString(),
          user_count: 1,
          customer_count: 5,
          order_count: 3,
          total_revenue: "20000.00",
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
    });

    vi.mocked(adminApi.fetchPlatformActivity).mockResolvedValueOnce([]);
    vi.mocked(adminApi.updateBusinessEntitlements).mockResolvedValueOnce({
      id: "bus-1",
      name: "Abuja Tailors",
      email: "owner@abuja.ng",
      phone: "+2348099998888",
      address: "Abuja",
      logo_url: null,
      currency: "NGN",
      timezone: "Africa/Lagos",
      enabled_features: ["customers", "orders"],
      max_staff_users: 10,
      is_active: true,
      created_at: new Date().toISOString(),
      user_count: 1,
      customer_count: 5,
      order_count: 3,
      total_revenue: "20000.00",
    });

    renderWithAuth(<SuperAdminPage />, { authenticated: true, route: "/admin" });

    const entBtn = await screen.findByRole("button", { name: /Entitlements/i });
    await user.click(entBtn);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Feature Entitlements: Abuja Tailors")).toBeInTheDocument();

    const saveBtn = screen.getByRole("button", { name: /Save Entitlements/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(adminApi.updateBusinessEntitlements).toHaveBeenCalled();
    });
  });
});
