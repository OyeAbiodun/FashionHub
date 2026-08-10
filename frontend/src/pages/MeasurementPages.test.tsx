import { Route, Routes } from "react-router-dom";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import { App } from "../App";
import * as customersApi from "../api/customers";
import * as measurementsApi from "../api/measurements";
import { CustomerMeasurementsSection } from "../components/CustomerMeasurementsSection";
import { MeasurementProfilePage } from "./MeasurementProfilePage";
import { NewMeasurementPage } from "./NewMeasurementPage";
import { renderWithAuth } from "../test/render";
import type { Customer } from "../types/customer";
import type {
  GlobalMeasurementProfileListItem,
  MeasurementProfile,
  MeasurementTemplate,
} from "../types/measurement";
import { MeasurementsPage } from "./MeasurementsPage";

vi.mock("../api/customers");
vi.mock("../api/measurements");

const customer: Customer = {
  id: "customer-1",
  first_name: "Bisi",
  last_name: "Adeleke",
  phone: "080 123-4567",
  alternate_phone: null,
  email: "bisi@example.com",
  gender: null,
  birthday: null,
  address: null,
  notes: null,
  archived_at: null,
  created_at: "2026-08-08T12:00:00Z",
  updated_at: "2026-08-08T12:00:00Z",
};

const template: MeasurementTemplate = {
  id: "template-1",
  name: "Senator",
  garment_type: "SENATOR",
  description: null,
  is_system_template: true,
  fields: [
    {
      id: "field-1",
      field_name: "Shoulder",
      field_key: "shoulder",
      position: 1,
      is_required: true,
      unit_hint: "inches",
    },
    {
      id: "field-2",
      field_name: "Chest",
      field_key: "chest",
      position: 2,
      is_required: true,
      unit_hint: "inches",
    },
  ],
};

const profile: MeasurementProfile = {
  id: "profile-1",
  customer_id: "customer-1",
  template_id: "template-1",
  template_name: "Senator",
  name: "Senator - Aug 2026",
  garment_type: "SENATOR",
  unit: "INCH",
  notes: "Initial fitting.",
  recorded_at: "2026-08-08T12:00:00Z",
  recorded_by: "user-1",
  recorded_by_name: "Ada Okafor",
  archived_at: null,
  created_at: "2026-08-08T12:00:00Z",
  updated_at: "2026-08-08T12:00:00Z",
  values: [
    {
      id: "value-1",
      field_name: "Shoulder",
      field_key: "shoulder",
      value: "18.25",
      notes: null,
      position: 1,
    },
    {
      id: "value-2",
      field_name: "Chest",
      field_key: "chest",
      value: "42.50",
      notes: null,
      position: 2,
    },
  ],
};

const globalProfile: GlobalMeasurementProfileListItem = {
  profile_id: profile.id,
  profile_name: profile.name,
  garment_type: profile.garment_type,
  unit: profile.unit,
  recorded_at: profile.recorded_at,
  archived_at: null,
  value_count: 2,
  customer_id: customer.id,
  customer_name: "Bisi Adeleke",
  customer_phone: customer.phone,
  template_name: profile.template_name,
  recorded_by_name: profile.recorded_by_name,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(customersApi.getCustomer).mockResolvedValue(customer);
  vi.mocked(customersApi.listCustomers).mockResolvedValue({
    items: [customer],
    page: 1,
    page_size: 8,
    total: 1,
    total_pages: 1,
  });
  vi.mocked(measurementsApi.listMeasurementProfiles).mockResolvedValue({
    items: [],
    page: 1,
    page_size: 10,
    total: 0,
    total_pages: 0,
  });
  vi.mocked(measurementsApi.listCustomerMeasurements).mockResolvedValue({
    items: [],
    page: 1,
    page_size: 10,
    total: 0,
    total_pages: 0,
  });
  vi.mocked(measurementsApi.listMeasurementTemplates).mockResolvedValue([
    {
      id: template.id,
      name: template.name,
      garment_type: template.garment_type,
      is_system_template: true,
    },
  ]);
  vi.mocked(measurementsApi.getMeasurementTemplate).mockResolvedValue(template);
  vi.mocked(measurementsApi.createCustomerMeasurement).mockResolvedValue(
    profile,
  );
  vi.mocked(measurementsApi.getMeasurementProfile).mockResolvedValue(profile);
  vi.mocked(measurementsApi.archiveMeasurementProfile).mockResolvedValue({
    ...profile,
    archived_at: "2026-08-08T13:00:00Z",
  });
  vi.mocked(measurementsApi.restoreMeasurementProfile).mockResolvedValue(
    profile,
  );
});

test("measurements route renders the global vault empty state", async () => {
  renderWithAuth(<App />, { authenticated: true, route: "/measurements" });
  expect(
    await screen.findByRole("heading", { name: "Measurement Vault" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByText("No measurements saved yet"),
  ).toBeInTheDocument();
});

test("measurement vault renders populated desktop and mobile results", async () => {
  vi.mocked(measurementsApi.listMeasurementProfiles).mockResolvedValueOnce({
    items: [globalProfile],
    page: 1,
    page_size: 10,
    total: 1,
    total_pages: 1,
  });
  renderWithAuth(<MeasurementsPage />, { authenticated: true });

  expect((await screen.findAllByText("Bisi Adeleke")).length).toBeGreaterThan(
    0,
  );
  expect(screen.getAllByText("SENATOR").length).toBeGreaterThan(0);
  expect(screen.getAllByText(/2 measurements/i).length).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: /view profile/i })).toHaveAttribute(
    "href",
    "/measurement-profiles/profile-1",
  );
});

test("measurement vault links customer and profile records", async () => {
  vi.mocked(measurementsApi.listMeasurementProfiles).mockResolvedValueOnce({
    items: [globalProfile],
    page: 1,
    page_size: 10,
    total: 1,
    total_pages: 1,
  });
  renderWithAuth(<MeasurementsPage />, { authenticated: true });

  expect(
    (await screen.findAllByRole("link", { name: /Bisi Adeleke/i }))[0],
  ).toHaveAttribute("href", "/customers/customer-1");
  expect(screen.getAllByRole("link", { name: /^view/i })[0]).toHaveAttribute(
    "href",
    "/measurement-profiles/profile-1",
  );
});

test("measurement search updates the backend query", async () => {
  renderWithAuth(<MeasurementsPage />, { authenticated: true });
  await userEvent.type(
    screen.getByPlaceholderText(/search customer, phone/i),
    "Amina",
  );
  await userEvent.click(screen.getByRole("button", { name: /apply filters/i }));
  await waitFor(() =>
    expect(measurementsApi.listMeasurementProfiles).toHaveBeenCalledWith(
      expect.objectContaining({ search: "Amina", page: 1 }),
    ),
  );
});

test("garment filter updates the backend query", async () => {
  renderWithAuth(<MeasurementsPage />, { authenticated: true });
  await userEvent.type(screen.getByPlaceholderText("Garment type"), "Agbada");
  await userEvent.click(screen.getByRole("button", { name: /apply filters/i }));
  await waitFor(() =>
    expect(measurementsApi.listMeasurementProfiles).toHaveBeenCalledWith(
      expect.objectContaining({ garment_type: "Agbada" }),
    ),
  );
});

test("archived filter updates the backend query and displays archived status", async () => {
  vi.mocked(measurementsApi.listMeasurementProfiles).mockImplementation(
    async (params) => ({
      items: params.archived
        ? [{ ...globalProfile, archived_at: "2026-08-09T12:00:00Z" }]
        : [],
      page: 1,
      page_size: 10,
      total: params.archived ? 1 : 0,
      total_pages: params.archived ? 1 : 0,
    }),
  );
  renderWithAuth(<MeasurementsPage />, { authenticated: true });
  await userEvent.click(screen.getByRole("checkbox", { name: /archived/i }));
  expect(await screen.findAllByText("Archived")).not.toHaveLength(0);
  expect(measurementsApi.listMeasurementProfiles).toHaveBeenCalledWith(
    expect.objectContaining({ archived: true }),
  );
});

test("measurement vault pagination requests the next page", async () => {
  vi.mocked(measurementsApi.listMeasurementProfiles).mockImplementation(
    async (params) => ({
      items: [globalProfile],
      page: params.page ?? 1,
      page_size: 10,
      total: 11,
      total_pages: 2,
    }),
  );
  renderWithAuth(<MeasurementsPage />, { authenticated: true });
  await screen.findByText("Page 1 of 2");
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() =>
    expect(measurementsApi.listMeasurementProfiles).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2 }),
    ),
  );
});

test("filtered measurement empty state clears filters", async () => {
  renderWithAuth(<MeasurementsPage />, { authenticated: true });
  await userEvent.type(
    screen.getByPlaceholderText(/search customer, phone/i),
    "missing",
  );
  await userEvent.click(screen.getByRole("button", { name: /apply filters/i }));
  expect(
    await screen.findByText("No measurements match your filters."),
  ).toBeInTheDocument();
  await userEvent.click(
    screen.getAllByRole("button", { name: /clear filters/i })[0],
  );
  await waitFor(() =>
    expect(measurementsApi.listMeasurementProfiles).toHaveBeenCalledWith(
      expect.objectContaining({ search: undefined }),
    ),
  );
});

test("add measurement opens customer selector", async () => {
  renderWithAuth(<MeasurementsPage />, { authenticated: true });
  await userEvent.click(
    screen.getAllByRole("button", { name: /add measurement/i })[0],
  );
  expect(
    await screen.findByRole("dialog", { name: "Select a customer" }),
  ).toBeInTheDocument();
  expect(await screen.findByText(customer.phone)).toBeInTheDocument();
});

test("customer selection navigates to the existing measurement form route", async () => {
  renderWithAuth(
    <Routes>
      <Route path="/measurements" element={<MeasurementsPage />} />
      <Route
        path="/customers/:customerId/measurements/new"
        element={<div>Existing measurement form</div>}
      />
    </Routes>,
    { authenticated: true, route: "/measurements" },
  );
  await userEvent.click(
    screen.getAllByRole("button", { name: /add measurement/i })[0],
  );
  await userEvent.click(
    await screen.findByRole("button", { name: /Bisi Adeleke/i }),
  );
  expect(
    await screen.findByText("Existing measurement form"),
  ).toBeInTheDocument();
});

test("customer selector no-customer state offers Add Customer", async () => {
  vi.mocked(customersApi.listCustomers).mockResolvedValueOnce({
    items: [],
    page: 1,
    page_size: 8,
    total: 0,
    total_pages: 0,
  });
  renderWithAuth(<MeasurementsPage />, { authenticated: true });
  await userEvent.click(
    screen.getAllByRole("button", { name: /add measurement/i })[0],
  );
  expect(
    await screen.findByText("Add a customer before recording measurements."),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /add customer/i })).toHaveAttribute(
    "href",
    "/customers/new",
  );
});

test("customer measurements empty state renders", async () => {
  renderWithAuth(<CustomerMeasurementsSection customerId="customer-1" />, {
    authenticated: true,
  });
  expect(
    await screen.findByText("No measurements saved yet."),
  ).toBeInTheDocument();
});

test("customer measurement list renders profiles", async () => {
  vi.mocked(measurementsApi.listCustomerMeasurements).mockResolvedValueOnce({
    items: [
      {
        id: profile.id,
        name: profile.name,
        garment_type: profile.garment_type,
        unit: profile.unit,
        template_name: profile.template_name,
        recorded_at: profile.recorded_at,
        recorded_by_name: profile.recorded_by_name,
        archived_at: null,
        value_count: 2,
      },
    ],
    page: 1,
    page_size: 10,
    total: 1,
    total_pages: 1,
  });
  renderWithAuth(<CustomerMeasurementsSection customerId="customer-1" />, {
    authenticated: true,
  });
  expect(await screen.findByText("Senator - Aug 2026")).toBeInTheDocument();
  expect(screen.getByText(/2 measurements/i)).toBeInTheDocument();
});

test("add Measurement navigation works", async () => {
  renderWithAuth(<CustomerMeasurementsSection customerId="customer-1" />, {
    authenticated: true,
  });
  expect(
    screen.getByRole("link", { name: /add measurement/i }),
  ).toHaveAttribute("href", "/customers/customer-1/measurements/new");
});

test("template list loads and selecting a template renders dynamic fields", async () => {
  renderWithAuth(
    <Routes>
      <Route
        path="/customers/:customerId/measurements/new"
        element={<NewMeasurementPage />}
      />
    </Routes>,
    { authenticated: true, route: "/customers/customer-1/measurements/new" },
  );
  expect(await screen.findByText(/Bisi Adeleke/)).toBeInTheDocument();
  expect(await screen.findByLabelText(/template/i)).toBeInTheDocument();
  expect(await screen.findByText(/Shoulder/)).toBeInTheDocument();
  expect(screen.getByText(/Chest/)).toBeInTheDocument();
});

test("required template measurements show validation errors", async () => {
  renderWithAuth(
    <Routes>
      <Route
        path="/customers/:customerId/measurements/new"
        element={<NewMeasurementPage />}
      />
    </Routes>,
    { authenticated: true, route: "/customers/customer-1/measurements/new" },
  );
  await screen.findByText(/Shoulder/);
  await userEvent.click(
    screen.getByRole("button", { name: /save measurement profile/i }),
  );
  expect(await screen.findByText("Shoulder is required")).toBeInTheDocument();
});

test("decimal measurement input is accepted and successful profile creation navigates", async () => {
  renderWithAuth(
    <Routes>
      <Route
        path="/customers/:customerId/measurements/new"
        element={<NewMeasurementPage />}
      />
      <Route
        path="/measurement-profiles/:profileId"
        element={<div>Measurement detail route</div>}
      />
    </Routes>,
    { authenticated: true, route: "/customers/customer-1/measurements/new" },
  );
  await screen.findByText(/Shoulder/);
  await userEvent.type(screen.getByLabelText(/Shoulder/), "18.25");
  await userEvent.type(screen.getByLabelText(/Chest/), "42.50");
  await userEvent.click(
    screen.getByRole("button", { name: /save measurement profile/i }),
  );
  expect(
    await screen.findByText("Measurement detail route"),
  ).toBeInTheDocument();
  expect(measurementsApi.createCustomerMeasurement).toHaveBeenCalledWith(
    "customer-1",
    expect.objectContaining({
      values: expect.arrayContaining([
        expect.objectContaining({ value: "42.50" }),
      ]),
    }),
  );
});

test("API submission error preserves entered values", async () => {
  vi.mocked(measurementsApi.createCustomerMeasurement).mockRejectedValueOnce({
    isAxiosError: true,
    response: { data: { detail: "Could not save measurements." } },
  });
  renderWithAuth(
    <Routes>
      <Route
        path="/customers/:customerId/measurements/new"
        element={<NewMeasurementPage />}
      />
    </Routes>,
    { authenticated: true, route: "/customers/customer-1/measurements/new" },
  );
  await screen.findByText(/Shoulder/);
  await userEvent.type(screen.getByLabelText(/Shoulder/), "18.25");
  await userEvent.type(screen.getByLabelText(/Chest/), "42.50");
  await userEvent.click(
    screen.getByRole("button", { name: /save measurement profile/i }),
  );
  expect(
    await screen.findByText("Could not save measurements."),
  ).toBeInTheDocument();
  expect(screen.getByDisplayValue("18.25")).toBeInTheDocument();
});

test("measurement detail page renders values and correct unit", async () => {
  renderWithAuth(
    <Routes>
      <Route
        path="/measurement-profiles/:profileId"
        element={<MeasurementProfilePage />}
      />
    </Routes>,
    { authenticated: true, route: "/measurement-profiles/profile-1" },
  );
  expect(await screen.findByText("Senator - Aug 2026")).toBeInTheDocument();
  expect(
    screen.getByText((_, element) => element?.textContent === "42.50in"),
  ).toBeInTheDocument();
  expect(screen.getByText("Initial fitting.")).toBeInTheDocument();
});

test("archive confirmation appears and archive action updates UI", async () => {
  renderWithAuth(
    <Routes>
      <Route
        path="/measurement-profiles/:profileId"
        element={<MeasurementProfilePage />}
      />
    </Routes>,
    { authenticated: true, route: "/measurement-profiles/profile-1" },
  );
  await screen.findByText("Senator - Aug 2026");
  await userEvent.click(screen.getByRole("button", { name: /^archive$/i }));
  expect(
    screen.getByText("Archive this measurement profile?"),
  ).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: /archive measurement/i }),
  );
  await waitFor(() =>
    expect(measurementsApi.archiveMeasurementProfile).toHaveBeenCalledWith(
      "profile-1",
    ),
  );
});

test("archived profile shows archived state and restore action works", async () => {
  vi.mocked(measurementsApi.getMeasurementProfile).mockResolvedValueOnce({
    ...profile,
    archived_at: "2026-08-08T13:00:00Z",
  });
  renderWithAuth(
    <Routes>
      <Route
        path="/measurement-profiles/:profileId"
        element={<MeasurementProfilePage />}
      />
    </Routes>,
    { authenticated: true, route: "/measurement-profiles/profile-1" },
  );
  expect(await screen.findByText("Archived")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /restore/i }));
  await waitFor(() =>
    expect(measurementsApi.restoreMeasurementProfile).toHaveBeenCalledWith(
      "profile-1",
    ),
  );
});

test("cross-route protected behavior remains intact", async () => {
  renderWithAuth(<App />, {
    authenticated: false,
    route: "/measurement-profiles/profile-1",
  });
  expect(await screen.findByText(/sign in to fashionos/i)).toBeInTheDocument();
});
