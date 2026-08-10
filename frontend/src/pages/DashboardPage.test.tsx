import { QueryClient } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import * as dashboardApi from "../api/dashboard";
import { invalidateDashboardQueries } from "../lib/dashboard-query";
import { renderWithAuth } from "../test/render";
import type {
  DashboardAlert,
  DashboardOrderItem,
  DashboardPaymentItem,
  DashboardSummary,
} from "../types/dashboard";
import { DashboardPage } from "./DashboardPage";

vi.mock("../api/dashboard");

const summary: DashboardSummary = {
  total_customers: 12,
  active_orders: 7,
  due_today: 2,
  overdue_orders: 1,
  ready_for_pickup: 1,
  collected_this_month: "125000.50",
  outstanding_balance: "85000.00",
};

const dueOrder: DashboardOrderItem = {
  id: "order-1",
  order_number: "ORD-000001",
  customer_id: "customer-1",
  customer_name: "Bisi Adeleke",
  customer_phone: "0801234567",
  status: "SEWING",
  due_date: "2026-08-08",
  created_at: "2026-08-01T12:00:00Z",
  garment_summary: "Agbada",
  is_overdue: true,
  days_overdue: 1,
  total: "90000.00",
  outstanding_balance: "55000.00",
};

const payment: DashboardPaymentItem = {
  id: "payment-1",
  order_id: "order-1",
  order_number: "ORD-000001",
  customer_id: "customer-1",
  customer_name: "Bisi Adeleke",
  amount: "30000.00",
  payment_method: "TRANSFER",
  paid_at: "2026-08-09T12:00:00Z",
  received_by_name: "Ada Okafor",
};

const alert: DashboardAlert = {
  id: "OVERDUE_ORDER:order-1",
  type: "OVERDUE_ORDER",
  severity: "HIGH",
  title: "Order ORD-000001 is overdue",
  message: "Bisi Adeleke's order was due 1 day ago.",
  order_id: "order-1",
  customer_id: "customer-1",
  created_from: "2026-08-08",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dashboardApi.getDashboardSummary).mockResolvedValue(summary);
  vi.mocked(dashboardApi.getDashboardAlerts).mockResolvedValue([alert]);
  vi.mocked(dashboardApi.getDueOrders).mockResolvedValue([dueOrder]);
  vi.mocked(dashboardApi.getRecentOrders).mockResolvedValue([
    { ...dueOrder, is_overdue: false, days_overdue: 0 },
  ]);
  vi.mocked(dashboardApi.getRecentPayments).mockResolvedValue([payment]);
});

test("dashboard renders real summary metrics without placeholder content", async () => {
  renderWithAuth(<DashboardPage />, { authenticated: true });
  expect(await screen.findByText("Customers")).toBeInTheDocument();
  expect(screen.getByText("12")).toBeInTheDocument();
  expect(screen.getByText("7")).toBeInTheDocument();
  expect(screen.getByText("2")).toBeInTheDocument();
  expect(screen.queryByText("Future payments")).not.toBeInTheDocument();
});

test("dashboard formats currency metrics with the business currency", async () => {
  renderWithAuth(<DashboardPage />, { authenticated: true });
  expect(await screen.findByText(/₦125,000.50/)).toBeInTheDocument();
  expect(screen.getByText(/₦85,000.00/)).toBeInTheDocument();
});

test("new business zero state keeps metrics and offers add customer CTA", async () => {
  vi.mocked(dashboardApi.getDashboardSummary).mockResolvedValue({
    ...summary,
    total_customers: 0,
    active_orders: 0,
    due_today: 0,
    overdue_orders: 0,
    ready_for_pickup: 0,
    collected_this_month: "0.00",
    outstanding_balance: "0.00",
  });
  renderWithAuth(<DashboardPage />, { authenticated: true });
  expect(
    await screen.findByText("Start with your first customer"),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Add Customer" })).toHaveAttribute(
    "href",
    "/customers/new",
  );
});

test("operational alert renders severity and links to the order", async () => {
  renderWithAuth(<DashboardPage />, { authenticated: true });
  expect(
    await screen.findByText("Order ORD-000001 is overdue"),
  ).toBeInTheDocument();
  expect(screen.getByText("HIGH")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View Order" })).toHaveAttribute(
    "href",
    "/orders/order-1",
  );
});

test("empty alert state renders", async () => {
  vi.mocked(dashboardApi.getDashboardAlerts).mockResolvedValue([]);
  renderWithAuth(<DashboardPage />, { authenticated: true });
  expect(
    await screen.findByText("No urgent operational issues right now."),
  ).toBeInTheDocument();
});

test("due orders show overdue text, garment, and balance", async () => {
  renderWithAuth(<DashboardPage />, { authenticated: true });
  expect(await screen.findByText("Overdue by 1 day")).toBeInTheDocument();
  expect(screen.getAllByText("Agbada").length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Balance ₦55,000.00/).length).toBeGreaterThan(0);
  expect(screen.getByText("Relevant date: 8 Aug 2026")).toBeInTheDocument();
});

test("recent orders and recent payments render", async () => {
  renderWithAuth(<DashboardPage />, { authenticated: true });
  expect(await screen.findByText(/30,000\.00/)).toBeInTheDocument();
  expect(screen.getByText("Recent Orders")).toBeInTheDocument();
  expect(screen.getByText("Recent Payments")).toBeInTheDocument();
  expect(screen.getByText(/₦30,000.00/)).toBeInTheDocument();
  expect(screen.getByText(/TRANSFER/)).toBeInTheDocument();
});

test("dashboard renders shaped loading states", () => {
  vi.mocked(dashboardApi.getDashboardSummary).mockReturnValue(
    new Promise(() => undefined),
  );
  vi.mocked(dashboardApi.getDashboardAlerts).mockReturnValue(
    new Promise(() => undefined),
  );
  renderWithAuth(<DashboardPage />, { authenticated: true });
  expect(
    screen.getByLabelText("Loading dashboard summary"),
  ).toBeInTheDocument();
  expect(
    screen.getAllByLabelText("Loading dashboard section").length,
  ).toBeGreaterThan(0);
});

test("summary error provides a retry action", async () => {
  vi.mocked(dashboardApi.getDashboardSummary).mockRejectedValue(
    new Error("offline"),
  );
  renderWithAuth(<DashboardPage />, { authenticated: true });
  expect(
    await screen.findByText("Could not load dashboard totals."),
  ).toBeInTheDocument();
  expect(
    screen.getAllByRole("button", { name: "Try Again" }).length,
  ).toBeGreaterThan(0);
});

test("one failed section does not hide successful dashboard sections", async () => {
  vi.mocked(dashboardApi.getRecentPayments).mockRejectedValue(
    new Error("offline"),
  );
  renderWithAuth(<DashboardPage />, { authenticated: true });
  expect(
    await screen.findByText("Could not load recent payments."),
  ).toBeInTheDocument();
  expect(screen.getByText("Order ORD-000001 is overdue")).toBeInTheDocument();
  expect(screen.getByText(/₦125,000.50/)).toBeInTheDocument();
});

test("dashboard invalidation helper invalidates every dashboard query", () => {
  const queryClient = new QueryClient();
  const spy = vi.spyOn(queryClient, "invalidateQueries");
  invalidateDashboardQueries(queryClient);
  expect(spy).toHaveBeenCalledTimes(5);
  expect(spy).toHaveBeenCalledWith({ queryKey: ["dashboard-summary"] });
  expect(spy).toHaveBeenCalledWith({ queryKey: ["dashboard-alerts"] });
});
