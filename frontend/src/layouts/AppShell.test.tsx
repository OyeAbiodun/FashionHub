import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, test, vi } from "vitest";

import { AppShell } from "./AppShell";
import { AuthContext } from "../lib/auth-context-value";
import { session } from "../test/render";

function renderShell(route = "/dashboard", logout = vi.fn()) {
  render(
    <MemoryRouter initialEntries={[route]}>
      <AuthContext.Provider
        value={{
          user: session.user,
          business: session.business,
          isAuthenticated: true,
          isLoading: false,
          login: vi.fn(),
          register: vi.fn(),
          logout,
          updateProfile: vi.fn(),
        }}
      >
        <Routes>
          <Route element={<AppShell />}>
            <Route path="*" element={<div>Page content</div>} />
          </Route>
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
  return { logout };
}

test("authenticated shell exposes the real primary navigation", () => {
  renderShell();
  expect(screen.getByText("FashionOS")).toBeInTheDocument();
  expect(screen.getAllByText("Ada Bespoke").length).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getByRole("link", { name: "Customers" })).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Measurements" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Orders" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
});

test.each([
  ["/measurements", "Measurements"],
  ["/measurement-profiles/profile-1", "Measurements"],
  ["/customers/customer-1/measurements/new", "Customers"],
  ["/invoices/invoice-1", "Orders"],
  ["/settings", "Settings"],
])("nested route %s keeps %s active", (route, activeLabel) => {
  renderShell(route);
  expect(screen.getByRole("link", { name: activeLabel })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("mobile navigation opens and closes with Escape", async () => {
  renderShell();
  const openButton = screen.getByRole("button", {
    name: "Open navigation menu",
  });
  await userEvent.click(openButton);
  expect(
    screen.getByRole("dialog", { name: "Navigation menu" }),
  ).toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  expect(
    screen.queryByRole("dialog", { name: "Navigation menu" }),
  ).not.toBeInTheDocument();
  expect(openButton).toHaveFocus();
});

test("sign out control invokes the authenticated session action", async () => {
  const logout = vi.fn().mockResolvedValue(undefined);
  renderShell("/dashboard", logout);
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(logout).toHaveBeenCalledOnce();
});
