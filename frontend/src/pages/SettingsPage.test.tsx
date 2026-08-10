import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";

import * as businessApi from "../api/business";
import * as authApi from "../api/auth";
import { renderWithAuth, session } from "../test/render";
import { SettingsPage } from "./SettingsPage";
import { App } from "../App";
import { BusinessLogo } from "../components/BusinessLogo";
import { AuthProvider } from "../lib/AuthContext";
import { AppShell } from "../layouts/AppShell";

vi.mock("../api/business");
vi.mock("../api/auth");

beforeEach(() => {
  vi.mocked(businessApi.getBusinessSettings).mockResolvedValue(
    session.business,
  );
  vi.mocked(authApi.fetchSession).mockResolvedValue(session);
  vi.mocked(businessApi.updateBusinessSettings).mockImplementation(
    async (values) => ({
      ...session.business,
      ...values,
    }),
  );
});

test("loads each business settings section and current values", async () => {
  renderWithAuth(<SettingsPage />, { authenticated: true });
  expect(
    await screen.findByRole("heading", { name: "Business Settings" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Business profile" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Branding" })).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Regional preferences" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Invoice preferences" }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByLabelText("Business name")).toHaveValue("Ada Bespoke"),
  );
  expect(screen.getByLabelText("Currency")).toHaveValue("NGN");
  expect(screen.getByLabelText("Timezone")).toHaveValue("Africa/Lagos");
});

test("validates and saves profile, branding, regional, and invoice preferences", async () => {
  const user = userEvent.setup();
  renderWithAuth(<SettingsPage />, { authenticated: true });
  const name = await screen.findByLabelText("Business name");
  await waitFor(() => expect(name).toHaveValue("Ada Bespoke"));
  await user.clear(name);
  await user.click(screen.getByRole("button", { name: "Save settings" }));
  expect(
    await screen.findByText("Business name is required"),
  ).toBeInTheDocument();
  expect(businessApi.updateBusinessSettings).not.toHaveBeenCalled();

  await user.type(name, "House of Ada");
  await user.type(
    screen.getByLabelText("Logo URL optional"),
    "https://example.com/logo.png",
  );
  await user.selectOptions(screen.getByLabelText("Currency"), "GBP");
  await user.selectOptions(screen.getByLabelText("Timezone"), "Europe/London");
  await user.type(
    screen.getByLabelText(/Default invoice notes optional/),
    "Pay by bank transfer.",
  );
  await user.type(
    screen.getByLabelText(/Invoice footer optional/),
    "Thank you.",
  );
  await user.click(screen.getByRole("button", { name: "Save settings" }));

  await waitFor(() =>
    expect(businessApi.updateBusinessSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "House of Ada",
        logo_url: "https://example.com/logo.png",
        currency: "GBP",
        timezone: "Europe/London",
        invoice_notes: "Pay by bank transfer.",
        invoice_footer: "Thank you.",
      }),
    ),
  );
  expect(
    await screen.findByText("Business settings saved."),
  ).toBeInTheDocument();
  expect(screen.getByAltText("House of Ada logo")).toHaveAttribute(
    "src",
    "https://example.com/logo.png",
  );
});

test("settings route is protected", async () => {
  renderWithAuth(<App />, { route: "/settings" });
  expect(
    await screen.findByRole("heading", { name: /sign in to fashionos/i }),
  ).toBeInTheDocument();
});

test("business logo falls back when absent or broken", () => {
  const { rerender } = renderWithAuth(
    <BusinessLogo name="House of Ada" logoUrl={null} />,
  );
  expect(
    screen.getByLabelText("House of Ada logo fallback"),
  ).toBeInTheDocument();
  rerender(
    <BusinessLogo
      name="House of Ada"
      logoUrl="https://example.com/broken.png"
    />,
  );
  fireEvent.error(screen.getByAltText("House of Ada logo"));
  expect(
    screen.getByLabelText("House of Ada logo fallback"),
  ).toBeInTheDocument();
});

test("saving settings updates the authenticated app shell without a reload", async () => {
  const user = userEvent.setup();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/settings"]}>
        <AuthProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const name = await screen.findByLabelText("Business name");
  await waitFor(() => expect(name).toHaveValue("Ada Bespoke"));
  await user.clear(name);
  await user.type(name, "House of Ada");
  await user.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() =>
    expect(screen.getAllByText("House of Ada").length).toBeGreaterThan(1),
  );
  expect(authApi.fetchSession).toHaveBeenCalledOnce();
});
