import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";

import { AuthContext } from "../lib/auth-context-value";
import type { AuthSession } from "../types/auth";

export const session: AuthSession = {
  user: {
    id: "user-1",
    business_id: "business-1",
    first_name: "Ada",
    last_name: "Okafor",
    email: "ada@example.com",
    phone: null,
    role: "OWNER",
    is_active: true,
  },
  business: {
    id: "business-1",
    name: "Ada Bespoke",
    email: null,
    phone: "+2348000000000",
    address: null,
    logo_url: null,
    currency: "NGN",
    timezone: "Africa/Lagos",
    invoice_notes: null,
    invoice_footer: null,
    enabled_features: [
      "customers",
      "measurements",
      "templates",
      "orders",
      "invoices",
      "reports",
      "team",
      "tasks",
      "installment_plans",
      "audit",
      "inventory",
      "communication",
    ],
  },
};

export function renderWithAuth(
  ui: ReactNode,
  options: { authenticated?: boolean; route?: string } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const authenticated = options.authenticated ?? false;
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[options.route ?? "/"]}>
        <AuthContext.Provider
          value={{
            user: authenticated ? session.user : null,
            business: authenticated ? session.business : null,
            isAuthenticated: authenticated,
            isLoading: false,
            login: vi.fn(),
            register: vi.fn(),
            logout: vi.fn(),
            updateProfile: vi.fn(),
          }}
        >
          {ui}
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
