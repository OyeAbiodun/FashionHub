import { Route, Routes } from "react-router-dom";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import { App } from "../App";
import * as customersApi from "../api/customers";
import * as measurementsApi from "../api/measurements";
import * as ordersApi from "../api/orders";
import * as paymentsApi from "../api/payments";
import * as invoicesApi from "../api/invoices";
import { CustomerOrdersSection } from "../components/CustomerOrdersSection";
import { NewOrderPage } from "./NewOrderPage";
import { OrderDetailPage } from "./OrderDetailPage";
import { OrdersPage } from "./OrdersPage";
import { renderWithAuth } from "../test/render";
import type { Customer } from "../types/customer";
import type { MeasurementProfileListItem } from "../types/measurement";
import type { OrderDetail, OrderListItem } from "../types/order";

vi.mock("../api/customers");
vi.mock("../api/measurements");
vi.mock("../api/orders");
vi.mock("../api/payments");
vi.mock("../api/invoices");

const customer: Customer = {
  id: "customer-1",
  first_name: "Bisi",
  last_name: "Adeleke",
  phone: "0801234567",
  alternate_phone: null,
  email: null,
  gender: null,
  birthday: null,
  address: null,
  notes: null,
  archived_at: null,
  created_at: "2026-08-08T12:00:00Z",
  updated_at: "2026-08-08T12:00:00Z",
};

const profile: MeasurementProfileListItem = {
  id: "profile-1",
  name: "Senator - Aug 2026",
  garment_type: "SENATOR",
  unit: "INCH",
  template_name: "Senator",
  recorded_at: "2026-08-08T12:00:00Z",
  recorded_by_name: "Ada Okafor",
  archived_at: null,
  value_count: 4,
};

const listOrder: OrderListItem = {
  id: "order-1",
  order_number: "ORD-000001",
  customer_id: "customer-1",
  customer_name: "Bisi Adeleke",
  customer_phone: "0801234567",
  status: "SEWING",
  order_date: "2026-08-08",
  due_date: "2026-08-10",
  item_count: 2,
  garment_summary: "Agbada, Trouser",
  is_overdue: false,
  overdue_days: 0,
  created_at: "2026-08-08T12:00:00Z",
  total: "90000.00",
  outstanding_balance: "60000.00",
};

const order: OrderDetail = {
  ...listOrder,
  customer: {
    id: "customer-1",
    first_name: "Bisi",
    last_name: "Adeleke",
    phone: "0801234567",
  },
  notes: "Wedding order.",
  created_by: "user-1",
  created_by_name: "Ada Okafor",
  delivered_at: null,
  cancelled_at: null,
  updated_at: "2026-08-08T12:00:00Z",
  items: [
    {
      id: "item-1",
      garment_type: "Agbada",
      description: "Blue brocade",
      quantity: 1,
      unit_price: "90000.00",
      line_total: "90000.00",
      measurement_profile_id: "profile-1",
      measurement_profile_name: "Senator - Aug 2026",
      style_reference_url: "https://example.com/style",
      notes: "Add embroidery.",
      status: "SEWING",
      position: 1,
    },
  ],
  status_history: [
    {
      id: "history-1",
      previous_status: null,
      new_status: "CONFIRMED",
      changed_by: "user-1",
      changed_by_name: "Ada Okafor",
      notes: "Order created.",
      changed_at: "2026-08-08T12:00:00Z",
    },
    {
      id: "history-2",
      previous_status: "CONFIRMED",
      new_status: "SEWING",
      changed_by: "user-1",
      changed_by_name: "Ada Okafor",
      notes: null,
      changed_at: "2026-08-09T12:00:00Z",
    },
  ],
  discount_amount: "0.00",
  subtotal: "90000.00",
  total: "90000.00",
  amount_paid: "30000.00",
  outstanding_balance: "60000.00",
  financial_status: "PARTIALLY_PAID",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(customersApi.listCustomers).mockResolvedValue({
    items: [customer],
    page: 1,
    page_size: 20,
    total: 1,
    total_pages: 1,
  });
  vi.mocked(customersApi.getCustomer).mockResolvedValue(customer);
  vi.mocked(measurementsApi.listCustomerMeasurements).mockResolvedValue({
    items: [profile],
    page: 1,
    page_size: 100,
    total: 1,
    total_pages: 1,
  });
  vi.mocked(ordersApi.listOrders).mockResolvedValue({
    items: [],
    page: 1,
    page_size: 10,
    total: 0,
    total_pages: 0,
  });
  vi.mocked(ordersApi.listCustomerOrders).mockResolvedValue({
    items: [],
    page: 1,
    page_size: 5,
    total: 0,
    total_pages: 0,
  });
  vi.mocked(ordersApi.getOrder).mockResolvedValue(order);
  vi.mocked(paymentsApi.listOrderPayments).mockResolvedValue([]);
  vi.mocked(invoicesApi.getOrderInvoice).mockRejectedValue({
    response: { status: 404 },
  });
  vi.mocked(ordersApi.createOrder).mockResolvedValue(order);
  vi.mocked(ordersApi.updateOrderStatus).mockResolvedValue({
    ...order,
    status: "FITTING",
    status_history: [
      ...order.status_history,
      {
        id: "history-3",
        previous_status: "SEWING",
        new_status: "FITTING",
        changed_by: "user-1",
        changed_by_name: "Ada Okafor",
        notes: "Ready for fitting.",
        changed_at: "2026-08-10T12:00:00Z",
      },
    ],
  });
});

test("orders empty state renders", async () => {
  renderWithAuth(<OrdersPage />, { authenticated: true });
  expect(await screen.findByText(/No orders yet/i)).toBeInTheDocument();
});

test("orders list renders returned orders and overdue text", async () => {
  vi.mocked(ordersApi.listOrders).mockResolvedValueOnce({
    items: [{ ...listOrder, is_overdue: true, overdue_days: 3 }],
    page: 1,
    page_size: 10,
    total: 1,
    total_pages: 1,
  });
  renderWithAuth(<OrdersPage />, { authenticated: true });
  expect((await screen.findAllByText("ORD-000001")).length).toBeGreaterThan(0);
  expect(screen.getAllByText("Overdue by 3 days").length).toBeGreaterThan(0);
});

test("search, status filter, and due filter update order query", async () => {
  renderWithAuth(<OrdersPage />, { authenticated: true });
  await userEvent.type(screen.getByLabelText(/search orders/i), "Bisi");
  await userEvent.selectOptions(screen.getByLabelText(/status/i), "SEWING");
  await userEvent.selectOptions(screen.getByLabelText(/due/i), "overdue");
  await userEvent.click(screen.getByRole("button", { name: /search/i }));
  await waitFor(() =>
    expect(ordersApi.listOrders).toHaveBeenLastCalledWith({
      search: "Bisi",
      status: "SEWING",
      due: "overdue",
      page: 1,
      page_size: 10,
    }),
  );
});

test("create order page loads and preselects customer from query parameter", async () => {
  renderWithAuth(
    <Routes>
      <Route path="/orders/new" element={<NewOrderPage />} />
    </Routes>,
    { authenticated: true, route: "/orders/new?customerId=customer-1" },
  );
  expect(await screen.findByText("Order for Bisi Adeleke")).toBeInTheDocument();
  expect(await screen.findByText(/Senator - Aug 2026/)).toBeInTheDocument();
});

test("add garment and remove garment work", async () => {
  renderWithAuth(<NewOrderPage />, {
    authenticated: true,
    route: "/orders/new",
  });
  await userEvent.click(
    screen.getByRole("button", { name: /add another garment/i }),
  );
  expect(await screen.findByText("Garment 2")).toBeInTheDocument();
  const removeButtons = screen.getAllByRole("button", {
    name: /remove garment/i,
  });
  await userEvent.click(removeButtons[1]);
  await waitFor(() =>
    expect(screen.queryByText("Garment 2")).not.toBeInTheDocument(),
  );
});

test("zero garment submission is blocked", async () => {
  renderWithAuth(<NewOrderPage />, {
    authenticated: true,
    route: "/orders/new",
  });
  await screen.findByRole("option", { name: /Bisi Adeleke/ });
  await userEvent.selectOptions(
    screen.getByLabelText(/selected customer/i),
    "customer-1",
  );
  await userEvent.click(
    screen.getByRole("button", { name: /remove garment/i }),
  );
  await userEvent.click(screen.getByRole("button", { name: /create order/i }));
  expect(
    await screen.findByText("Add at least one garment."),
  ).toBeInTheDocument();
});

test("customer change clears incompatible measurement profile selections", async () => {
  renderWithAuth(<NewOrderPage />, {
    authenticated: true,
    route: "/orders/new?customerId=customer-1",
  });
  await screen.findByText(/Senator - Aug 2026/);
  await userEvent.selectOptions(
    screen.getByLabelText(/measurement profile/i),
    "profile-1",
  );
  await userEvent.selectOptions(
    screen.getByLabelText(/selected customer/i),
    "customer-1",
  );
  expect(
    await screen.findByText(/Measurement profile selections were cleared/i),
  ).toBeInTheDocument();
});

test("order creation success navigates to detail", async () => {
  renderWithAuth(
    <Routes>
      <Route path="/orders/new" element={<NewOrderPage />} />
      <Route
        path="/orders/:orderId"
        element={<div>Created order detail</div>}
      />
    </Routes>,
    { authenticated: true, route: "/orders/new?customerId=customer-1" },
  );
  await screen.findByText("Order for Bisi Adeleke");
  await userEvent.type(screen.getByLabelText(/garment type/i), "Agbada");
  await userEvent.type(screen.getByLabelText(/due date/i), "2026-08-20");
  await userEvent.upload(
    screen.getByLabelText(/order reference photo required/i),
    new File(["image"], "reference.png", { type: "image/png" }),
  );
  await userEvent.click(screen.getByRole("button", { name: /create order/i }));
  expect(await screen.findByText("Created order detail")).toBeInTheDocument();
});

test("API creation error preserves form state", async () => {
  vi.mocked(ordersApi.createOrder).mockRejectedValueOnce({
    isAxiosError: true,
    response: { data: { detail: "Could not create order." } },
  });
  renderWithAuth(<NewOrderPage />, {
    authenticated: true,
    route: "/orders/new?customerId=customer-1",
  });
  await screen.findByText("Order for Bisi Adeleke");
  await userEvent.type(screen.getByLabelText(/garment type/i), "Agbada");
  await userEvent.type(screen.getByLabelText(/due date/i), "2026-08-20");
  await userEvent.upload(
    screen.getByLabelText(/order reference photo required/i),
    new File(["image"], "reference.png", { type: "image/png" }),
  );
  await userEvent.click(screen.getByRole("button", { name: /create order/i }));
  expect(
    await screen.findByText("Could not create order."),
  ).toBeInTheDocument();
  expect(screen.getByDisplayValue("Agbada")).toBeInTheDocument();
});

test("order detail renders items, measurement link, and timeline", async () => {
  renderWithAuth(
    <Routes>
      <Route path="/orders/:orderId" element={<OrderDetailPage />} />
    </Routes>,
    { authenticated: true, route: "/orders/order-1" },
  );
  expect(await screen.findByText("ORD-000001")).toBeInTheDocument();
  expect(screen.getByText("Blue brocade")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Senator - Aug 2026" }),
  ).toHaveAttribute("href", "/measurement-profiles/profile-1");
  expect(screen.getByText("Production Timeline")).toBeInTheDocument();
});

test("update status shows only allowed transitions and refreshes UI", async () => {
  renderWithAuth(
    <Routes>
      <Route path="/orders/:orderId" element={<OrderDetailPage />} />
    </Routes>,
    { authenticated: true, route: "/orders/order-1" },
  );
  await screen.findByText("ORD-000001");
  await userEvent.click(screen.getByRole("button", { name: /update status/i }));
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog)
      .getAllByRole("radio")
      .some((radio) => radio.getAttribute("value") === "FITTING"),
  ).toBe(true);
  expect(
    within(dialog)
      .getAllByRole("radio")
      .some((radio) => radio.getAttribute("value") === "CONFIRMED"),
  ).toBe(false);
  const fittingOption = within(dialog)
    .getAllByRole("radio")
    .find((radio) => radio.getAttribute("value") === "FITTING");
  await userEvent.click(fittingOption!);
  await userEvent.type(
    within(dialog).getByLabelText(/notes optional/i),
    "Ready for fitting.",
  );
  await userEvent.click(
    within(dialog).getByRole("button", { name: /update status/i }),
  );
  await waitFor(() =>
    expect(ordersApi.updateOrderStatus).toHaveBeenCalledWith("order-1", {
      status: "FITTING",
      notes: "Ready for fitting.",
    }),
  );
});

test("cancel action requires confirmation", async () => {
  renderWithAuth(
    <Routes>
      <Route path="/orders/:orderId" element={<OrderDetailPage />} />
    </Routes>,
    { authenticated: true, route: "/orders/order-1" },
  );
  await screen.findByText("ORD-000001");
  await userEvent.click(screen.getByRole("button", { name: /update status/i }));
  const dialog = screen.getByRole("dialog");
  const cancelledOption = within(dialog)
    .getAllByRole("radio")
    .find((radio) => radio.getAttribute("value") === "CANCELLED");
  expect(cancelledOption).toBeDefined();
  await userEvent.click(cancelledOption!);
  await userEvent.click(
    within(dialog).getByRole("button", { name: /update status/i }),
  );
  expect(await screen.findByText(/Cancel this order/i)).toBeInTheDocument();
});

test("customer detail live orders section renders", async () => {
  vi.mocked(ordersApi.listCustomerOrders).mockResolvedValueOnce({
    items: [listOrder],
    page: 1,
    page_size: 5,
    total: 1,
    total_pages: 1,
  });
  renderWithAuth(<CustomerOrdersSection customerId="customer-1" />, {
    authenticated: true,
  });
  expect(await screen.findByText("ORD-000001")).toBeInTheDocument();
});

test("protected order route behavior remains intact", async () => {
  renderWithAuth(<App />, { authenticated: false, route: "/orders/order-1" });
  expect(await screen.findByText(/sign in to fashionos/i)).toBeInTheDocument();
});
