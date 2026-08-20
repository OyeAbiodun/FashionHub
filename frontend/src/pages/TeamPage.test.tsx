import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import * as teamApi from "../api/team";
import { renderWithAuth, session } from "../test/render";
import { TeamPage } from "./TeamPage";

vi.mock("../api/team", async (importOriginal) => {
  const actual = await importOriginal<typeof teamApi>();
  return {
    ...actual,
    fetchTeamMembers: vi.fn(),
    addStaffMember: vi.fn(),
    updateStaffMember: vi.fn(),
  };
});

describe("TeamPage", () => {
  it("renders team members list and metrics", async () => {
    vi.mocked(teamApi.fetchTeamMembers).mockResolvedValueOnce([
      {
        id: session.user.id,
        business_id: session.business.id,
        first_name: "Ada",
        last_name: "Okafor",
        email: "ada@example.com",
        phone: "+2348000000000",
        role: "OWNER",
        permissions: null,
        is_active: true,
      },
    ]);

    renderWithAuth(<TeamPage />, { authenticated: true, route: "/team" });

    expect(screen.getByText("Team & Dynamic Role Management")).toBeInTheDocument();
    expect(await screen.findByText("Ada Okafor")).toBeInTheDocument();
    expect(screen.getByText("Full Business Access")).toBeInTheDocument();
  });

  it("opens add staff modal and submits new staff member", async () => {
    const user = userEvent.setup();

    vi.mocked(teamApi.fetchTeamMembers).mockResolvedValueOnce([
      {
        id: session.user.id,
        business_id: session.business.id,
        first_name: "Ada",
        last_name: "Okafor",
        email: "ada@example.com",
        phone: "+2348000000000",
        role: "OWNER",
        permissions: null,
        is_active: true,
      },
    ]);

    vi.mocked(teamApi.addStaffMember).mockResolvedValueOnce({
      id: "staff-2",
      business_id: session.business.id,
      first_name: "Emeka",
      last_name: "Tailor",
      email: "emeka@example.com",
      phone: null,
      role: "STAFF",
      permissions: ["orders:read"],
      is_active: true,
    });

    renderWithAuth(<TeamPage />, { authenticated: true, route: "/team" });

    const addBtn = await screen.findByRole("button", { name: /Add Staff Member/i });
    await user.click(addBtn);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    const inputs = within(dialog).getAllByRole("textbox");
    const firstNameInput = inputs[0]; // First Name
    const lastNameInput = inputs[1];  // Last Name
    const emailInput = inputs[2];     // Email Address

    const passwordInput = within(dialog).getByLabelText("Temporary Password");

    await user.type(firstNameInput, "Emeka");
    await user.type(lastNameInput, "Tailor");
    await user.type(emailInput, "emeka@example.com");
    await user.type(passwordInput, "StaffPass123!");

    const submitBtn = within(dialog).getByRole("button", { name: /Add Staff Member/i });
    await user.click(submitBtn);

    await waitFor(
      () => {
        expect(teamApi.addStaffMember).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  });
});
