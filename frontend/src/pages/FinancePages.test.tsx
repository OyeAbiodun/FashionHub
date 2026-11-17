import { Route, Routes } from "react-router-dom";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import { App } from "../App";
import * as customersApi from "../api/customers";
import * as invoicesApi from "../api/invoices";
import * as measurementsApi from "../api/measurements";
import * as ordersApi from "../api/orders";
import * as paymentsApi from "../api/payments";
import { CustomerPaymentsSection } from "../components/CustomerPaymentsSection";
import { InvoicePage } from "./InvoicePage";
import { NewOrderPage } from "./NewOrderPage";
import { OrderDetailPage } from "./OrderDetailPage";
import { renderWithAuth } from "../test/render";
import type { Customer } from "../types/customer";
import type { Invoice } from "../types/invoice";
import type { OrderDetail } from "../types/order";
import type { Payment } from "../types/payment";

vi.mock("../api/customers");
vi.mock("../api/invoices");
vi.mock("../api/measurements");
vi.mock("../api/orders");
vi.mock("../api/payments");

const customer: Customer = {
  id: "customer-1",
  first_name: "Bisi",
  last_name: "Adeleke",
  phone: "0801234567",
  alternate_phone: null,
  email: "bisi@example.com",
  gender: null,
  birthday: null,
  address: "Lagos",
  notes: null,
  archived_at: null,
  created_at: "2026-08-08T12:00:00Z",
  updated_at: "2026-08-08T12:00:00Z",
};

const payment: Payment = {
  id: "payment-1",
  order_id: "order-1",
  customer_id: "customer-1",
  amount: "30000.00",
  payment_method: "TRANSFER",
  status: "SUCCESSFUL",
  reference: "BANK-123",
  notes: null,
  received_by: "user-1",
  received_by_name: "Ada Okafor",
  paid_at: "2026-08-09T12:00:00Z",
  created_at: "2026-08-09T12:00:00Z",
};

const order: OrderDetail = {
  id: "order-1",
  order_number: "ORD-000001",
  customer: {
    id: "customer-1",
    first_name: "Bisi",
    last_name: "Adeleke",
    phone: "0801234567",
  },
  status: "SEWING",
  order_date: "2026-08-08",
  due_date: "2026-08-20",
  notes: null,
  created_by: "user-1",
  created_by_name: "Ada Okafor",
  delivered_at: null,
  cancelled_at: null,
  created_at: "2026-08-08T12:00:00Z",
  updated_at: "2026-08-08T12:00:00Z",
  items: [
    {
      id: "item-1",
      garment_type: "Agbada",
      description: "Blue brocade",
      quantity: 2,
      unit_price: "45000.00",
      line_total: "90000.00",
      measurement_profile_id: null,
      measurement_profile_name: null,
      style_reference_url: null,
      notes: null,
      status: "SEWING",
      position: 1,
    },
  ],
  status_history: [],
  is_overdue: false,
  overdue_days: 0,
  discount_amount: "5000.00",
  subtotal: "90000.00",
  total: "85000.00",
  amount_paid: "30000.00",
  outstanding_balance: "55000.00",
  financial_status: "PARTIALLY_PAID",
};

const invoice: Invoice = {
  id: "invoice-1",
  invoice_number: "INV-000001",
  status: "PARTIALLY_PAID",
  issued_at: "2026-08-09T12:00:00Z",
  due_date: "2026-08-20",
  notes: "Thank you.",
  created_at: "2026-08-09T12:00:00Z",
  business: {
    name: "Ada Bespoke",
    phone: "+2348000000000",
    email: "hello@example.com",
    address: "Yaba, Lagos",
    logo_url: null,
    currency: "NGN",
    timezone: "Africa/Lagos",
    invoice_notes: "Bank transfer: 000111222",
    invoice_footer: "Thank you for choosing Ada Bespoke.",
  },
  customer: {
    id: "customer-1",
    name: "Bisi Adeleke",
    phone: "0801234567",
    email: "bisi@example.com",
    address: "Lagos",
  },
  order: {
    id: "order-1",
    order_number: "ORD-000001",
    order_date: "2026-08-08",
    due_date: "2026-08-20",
  },
  items: [
    {
      garment_type: "Agbada",
      description: "Blue brocade",
      quantity: 2,
      unit_price: "45000.00",
      line_total: "90000.00",
    },
  ],
  financial_summary: {
    subtotal: "90000.00",
    discount_amount: "5000.00",
    total: "85000.00",
    amount_paid: "30000.00",
    outstanding_balance: "55000.00",
  },
  payments: [payment],
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
    items: [],
    page: 1,
    page_size: 100,
    total: 0,
    total_pages: 0,
  });
  vi.mocked(ordersApi.getOrder).mockResolvedValue(order);
  vi.mocked(ordersApi.createOrder).mockResolvedValue(order);
  vi.mocked(paymentsApi.listOrderPayments).mockResolvedValue([]);
  vi.mocked(paymentsApi.createOrderPayment).mockResolvedValue(payment);
  vi.mocked(paymentsApi.listCustomerPayments).mockResolvedValue({
    items: [{ ...payment, order_number: "ORD-000001", customer_name: "Bisi Adeleke" }],
    page: 1,
    page_size: 5,
    total: 1,
    total_pages: 1,
  });
  vi.mocked(invoicesApi.getOrderInvoice).mockRejectedValue({
    response: { status: 404 },
  });
  vi.mocked(invoicesApi.getInvoice).mockResolvedValue(invoice);
  vi.mocked(invoicesApi.createInvoice).mockResolvedValue(invoice);
});

test("create order renders pricing and updates line total and subtotal", async () => {
  renderWithAuth(<NewOrderPage />, {
    authenticated: true,
    route: "/orders/new?customerId=customer-1",
  });
  const unitPrice = await screen.findByLabelText("Price per garment 1");
  await userEvent.clear(unitPrice);
  await userEvent.type(unitPrice, "45000");
  await userEvent.clear(screen.getByLabelText(/quantity/i));
  await userEvent.type(screen.getByLabelText(/quantity/i), "2");
  expect(screen.getAllByText(/₦90,000.00/).length).toBeGreaterThan(0);
});

test("discount updates total and invalid discount is rejected", async () => {
  renderWithAuth(<NewOrderPage />, {
    authenticated: true,
    route: "/orders/new?customerId=customer-1",
  });
  await userEvent.type(await screen.findByLabelText(/garment type/i), "Agbada");
  const unitPrice = screen.getByLabelText("Price per garment 1");
  await userEvent.clear(unitPrice);
  await userEvent.type(unitPrice, "100");
  const discount = screen.getByLabelText(/^discount$/i);
  await userEvent.clear(discount);
  await userEvent.type(discount, "101");
  await userEvent.type(screen.getByLabelText(/due date/i), "2026-08-20");
  await userEvent.click(screen.getByRole("button", { name: /create order/i }));
  expect(
    await screen.findByText("Discount cannot exceed the subtotal."),
  ).toBeInTheDocument();
});

test("order detail renders authoritative financial summary and empty payments", async () => {
  renderOrderDetail();
  expect(await screen.findByText("Financial Summary")).toBeInTheDocument();
  expect(screen.getAllByText(/₦55,000.00/).length).toBeGreaterThan(0);
  expect(
    await screen.findByText("No payments recorded for this order yet."),
  ).toBeInTheDocument();
});

test("order detail renders multiple payment records", async () => {
  vi.mocked(paymentsApi.listOrderPayments).mockResolvedValue([
    payment,
    {
      ...payment,
      id: "payment-2",
      amount: "10000.00",
      payment_method: "CASH",
      reference: null,
    },
  ]);
  renderOrderDetail();
  expect(
    await screen.findByText("BANK-123", { exact: false }),
  ).toBeInTheDocument();
  expect(screen.getByText(/₦10,000.00/)).toBeInTheDocument();
});

test("record payment opens form and blocks overpayment", async () => {
  renderOrderDetail();
  await screen.findByText("Financial Summary");
  await userEvent.click(screen.getByRole("button", { name: "Record Payment" }));
  const dialog = screen.getByRole("dialog");
  const amount = within(dialog).getByLabelText("Amount");
  await userEvent.clear(amount);
  await userEvent.type(amount, "55000.01");
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Record Payment" }),
  );
  expect(
    await within(dialog).findByText(
      "Payment cannot exceed the outstanding balance.",
    ),
  ).toBeInTheDocument();
});

test("successful payment shows feedback and calls API", async () => {
  renderOrderDetail();
  await screen.findByText("Financial Summary");
  await userEvent.click(screen.getByRole("button", { name: "Record Payment" }));
  await userEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Record Payment",
    }),
  );
  expect(
    await screen.findByText("Payment recorded successfully."),
  ).toBeInTheDocument();
  expect(paymentsApi.createOrderPayment).toHaveBeenCalled();
});

test("fully paid order replaces record payment with fully paid state", async () => {
  vi.mocked(ordersApi.getOrder).mockResolvedValue({
    ...order,
    amount_paid: "85000.00",
    outstanding_balance: "0.00",
    financial_status: "PAID",
  });
  renderOrderDetail();
  expect(await screen.findByText("Fully Paid")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Record Payment" }),
  ).not.toBeInTheDocument();
});

test("generate invoice appears and successful creation navigates", async () => {
  renderWithAuth(
    <Routes>
      <Route path="/orders/:orderId" element={<OrderDetailPage />} />
      <Route
        path="/invoices/:invoiceId"
        element={<div>Invoice destination</div>}
      />
    </Routes>,
    { authenticated: true, route: "/orders/order-1" },
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Generate Invoice" }),
  );
  expect(await screen.findByText("Invoice destination")).toBeInTheDocument();
});

test("existing invoice displays view invoice action", async () => {
  vi.mocked(invoicesApi.getOrderInvoice).mockResolvedValue(invoice);
  renderOrderDetail();
  expect(
    await screen.findByRole("link", { name: "View Invoice" }),
  ).toHaveAttribute("href", "/invoices/invoice-1");
});

test("invoice page renders parties items summary and status", async () => {
  renderWithAuth(
    <Routes>
      <Route path="/invoices/:invoiceId" element={<InvoicePage />} />
    </Routes>,
    { authenticated: true, route: "/invoices/invoice-1" },
  );
  expect(await screen.findByText("INV-000001")).toBeInTheDocument();
  expect(screen.getByText("Ada Bespoke")).toBeInTheDocument();
  expect(screen.getByText("Bisi Adeleke")).toBeInTheDocument();
  expect(screen.getByText("Blue brocade")).toBeInTheDocument();
  expect(
    screen.getByText("PARTIALLY PAID", { exact: false }),
  ).toBeInTheDocument();
  expect(screen.getByText("Balance Due")).toBeInTheDocument();
  expect(screen.getByText("Bank transfer: 000111222")).toBeInTheDocument();
  expect(
    screen.getByText("Thank you for choosing Ada Bespoke."),
  ).toBeInTheDocument();
});

test("customer payment history renders live order-linked payments", async () => {
  renderWithAuth(<CustomerPaymentsSection customerId="customer-1" />, {
    authenticated: true,
  });
  expect(await screen.findByText(/ORD-000001/)).toBeInTheDocument();
  expect(screen.getByText(/₦30,000.00/)).toBeInTheDocument();
});

test("protected invoice route redirects unauthenticated users", async () => {
  renderWithAuth(<App />, {
    authenticated: false,
    route: "/invoices/invoice-1",
  });
  expect(await screen.findByText(/sign in to fashionos/i)).toBeInTheDocument();
});

function renderOrderDetail() {
  return renderWithAuth(
    <Routes>
      <Route path="/orders/:orderId" element={<OrderDetailPage />} />
    </Routes>,
    { authenticated: true, route: "/orders/order-1" },
  );
}
