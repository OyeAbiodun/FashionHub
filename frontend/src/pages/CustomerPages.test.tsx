import { Route, Routes } from "react-router-dom";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import { App } from "../App";
import * as customersApi from "../api/customers";
import * as measurementsApi from "../api/measurements";
import * as ordersApi from "../api/orders";
import * as paymentsApi from "../api/payments";
import { CustomerDetailPage } from "./CustomerDetailPage";
import { CustomersPage } from "./CustomersPage";
import { EditCustomerPage } from "./EditCustomerPage";
import { NewCustomerPage } from "./NewCustomerPage";
import { renderWithAuth } from "../test/render";
import type { Customer } from "../types/customer";

vi.mock("../api/customers");
vi.mock("../api/measurements");
vi.mock("../api/orders");
vi.mock("../api/payments");

const customer: Customer = {
  id: "customer-1",
  first_name: "Bisi",
  last_name: "Adeleke",
  phone: "080 123-4567",
  alternate_phone: "0810000000",
  email: "bisi@example.com",
  gender: "Female",
  birthday: "1992-04-10",
  address: "Yaba, Lagos",
  notes: "Prefers evening fittings.",
  archived_at: null,
  created_at: "2026-08-08T12:00:00Z",
  updated_at: "2026-08-08T12:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(customersApi.listCustomers).mockResolvedValue({
    items: [],
    page: 1,
    page_size: 10,
    total: 0,
    total_pages: 0,
  });
  vi.mocked(customersApi.getCustomer).mockResolvedValue(customer);
  vi.mocked(customersApi.createCustomer).mockResolvedValue(customer);
  vi.mocked(customersApi.updateCustomer).mockResolvedValue(customer);
  vi.mocked(customersApi.archiveCustomer).mockResolvedValue({
    ...customer,
    archived_at: "2026-08-08T12:30:00Z",
  });
  vi.mocked(customersApi.restoreCustomer).mockResolvedValue(customer);
  vi.mocked(measurementsApi.listCustomerMeasurements).mockResolvedValue({
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
  vi.mocked(paymentsApi.listCustomerPayments).mockResolvedValue({
    items: [],
    page: 1,
    page_size: 5,
    total: 0,
    total_pages: 0,
  });
});

test("customer list renders returned customers", async () => {
  vi.mocked(customersApi.listCustomers).mockResolvedValueOnce({
    items: [customer],
    page: 1,
    page_size: 10,
    total: 1,
    total_pages: 1,
  });
  renderWithAuth(<CustomersPage />, { authenticated: true });
  expect((await screen.findAllByText("Bisi Adeleke")).length).toBeGreaterThan(
    0,
  );
  expect(screen.getAllByText("080 123-4567").length).toBeGreaterThan(0);
});

test("customer empty state renders correctly", async () => {
  renderWithAuth(<CustomersPage />, { authenticated: true });
  expect(await screen.findByText("No customers yet")).toBeInTheDocument();
});

test("search interaction updates customer query", async () => {
  renderWithAuth(<CustomersPage />, { authenticated: true });
  await userEvent.type(
    screen.getByLabelText(/search by name or phone/i),
    "Bisi",
  );
  await userEvent.click(screen.getByRole("button", { name: /search/i }));
  await waitFor(() =>
    expect(customersApi.listCustomers).toHaveBeenLastCalledWith({
      search: "Bisi",
      page: 1,
      page_size: 10,
      archived: false,
    }),
  );
});

test("customer create form validates required fields", async () => {
  renderWithAuth(<NewCustomerPage />, { authenticated: true });
  await userEvent.click(
    screen.getByRole("button", { name: /create customer/i }),
  );
  expect(await screen.findByText("First name is required")).toBeInTheDocument();
  expect(screen.getByText("Phone is required")).toBeInTheDocument();
});

test("successful customer creation navigates to detail page", async () => {
  renderWithAuth(
    <Routes>
      <Route path="/customers/new" element={<NewCustomerPage />} />
      <Route
        path="/customers/:customerId"
        element={<div>Created detail</div>}
      />
    </Routes>,
    { authenticated: true, route: "/customers/new" },
  );
  await userEvent.type(screen.getByLabelText(/^First name/i), "Bisi");
  await userEvent.type(screen.getByLabelText(/^Phone/i), "0801234567");
  await userEvent.click(
    screen.getByRole("button", { name: /create customer/i }),
  );
  expect(await screen.findByText("Created detail")).toBeInTheDocument();
});

test("duplicate-phone API error is displayed", async () => {
  vi.mocked(customersApi.createCustomer).mockRejectedValueOnce({
    isAxiosError: true,
    response: {
      data: { detail: "A customer with this phone number already exists." },
    },
  });
  renderWithAuth(<NewCustomerPage />, { authenticated: true });
  await userEvent.type(screen.getByLabelText(/^First name/i), "Bisi");
  await userEvent.type(screen.getByLabelText(/^Phone/i), "0801234567");
  await userEvent.click(
    screen.getByRole("button", { name: /create customer/i }),
  );
  expect(
    await screen.findByText(
      "A customer with this phone number already exists.",
    ),
  ).toBeInTheDocument();
});

test("customer detail renders profile information", async () => {
  renderWithAuth(
    <Routes>
      <Route path="/customers/:customerId" element={<CustomerDetailPage />} />
    </Routes>,
    { authenticated: true, route: "/customers/customer-1" },
  );
  expect(await screen.findByText("Bisi Adeleke")).toBeInTheDocument();
  expect(screen.getByText("Prefers evening fittings.")).toBeInTheDocument();
  expect(screen.getByText("Measurement Vault")).toBeInTheDocument();
  expect(await screen.findByText(/sizing history/i)).toBeInTheDocument();
  expect(
    await screen.findByText("No orders yet for this customer."),
  ).toBeInTheDocument();
});

test("edit form loads existing values", async () => {
  renderWithAuth(
    <Routes>
      <Route
        path="/customers/:customerId/edit"
        element={<EditCustomerPage />}
      />
    </Routes>,
    { authenticated: true, route: "/customers/customer-1/edit" },
  );
  expect(await screen.findByDisplayValue("Bisi")).toBeInTheDocument();
  expect(screen.getByDisplayValue("080 123-4567")).toBeInTheDocument();
});

test("archive confirmation is shown before archiving", async () => {
  renderWithAuth(
    <Routes>
      <Route path="/customers/:customerId" element={<CustomerDetailPage />} />
    </Routes>,
    { authenticated: true, route: "/customers/customer-1" },
  );
  await screen.findByText("Bisi Adeleke");
  await userEvent.click(screen.getByRole("button", { name: /^archive$/i }));
  expect(screen.getByText("Archive this customer?")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /archive customer/i }),
  ).toBeInTheDocument();
});

test("archived customer displays archived state", async () => {
  vi.mocked(customersApi.getCustomer).mockResolvedValueOnce({
    ...customer,
    archived_at: "2026-08-08T12:30:00Z",
  });
  renderWithAuth(
    <Routes>
      <Route path="/customers/:customerId" element={<CustomerDetailPage />} />
    </Routes>,
    { authenticated: true, route: "/customers/customer-1" },
  );
  expect(await screen.findByText("Archived")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /restore/i })).toBeInTheDocument();
});

test("protected customer pages redirect unauthenticated users appropriately", async () => {
  renderWithAuth(<App />, { authenticated: false, route: "/customers" });
  expect(await screen.findByText(/sign in to fashionos/i)).toBeInTheDocument();
});
