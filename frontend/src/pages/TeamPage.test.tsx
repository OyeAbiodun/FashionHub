import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as rolesApi from "../api/roles";
import * as teamApi from "../api/team";
import { renderWithAuth, session } from "../test/render";
import { TeamPage } from "./TeamPage";

vi.mock("../api/team", async (importOriginal) => {
  const actual = await importOriginal<typeof teamApi>();
  return {
    ...actual,
    fetchTeamMembers: vi.fn(),
    fetchTeamInvitations: vi.fn(),
    addStaffMember: vi.fn(),
    updateStaffMember: vi.fn(),
  };
});
vi.mock("../api/roles", async (importOriginal) => {
  const actual = await importOriginal<typeof rolesApi>();
  return { ...actual, fetchRoles: vi.fn() };
});

describe("TeamPage", () => {
  beforeEach(() => {
    vi.mocked(teamApi.fetchTeamMembers).mockResolvedValue([]);
    vi.mocked(teamApi.fetchTeamInvitations).mockResolvedValue([]);
    vi.mocked(rolesApi.fetchRoles).mockResolvedValue([]);
  });

  it("renders team members list and metrics", async () => {
    vi.mocked(teamApi.fetchTeamInvitations).mockResolvedValue([]);
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

  it("sends a staff invitation without asking the owner for a password", async () => {
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
    vi.mocked(teamApi.fetchTeamInvitations).mockResolvedValue([]);

    vi.mocked(teamApi.addStaffMember).mockResolvedValueOnce({
      id: "staff-2",
      business_id: session.business.id,
      first_name: "Emeka",
      last_name: "Tailor",
      email: "emeka@example.com",
      phone: null,
      role: "STAFF",
      permissions: ["orders:read"],
      custom_role_id: null,
      status: "PENDING",
      expires_at: "2026-11-18T12:00:00Z",
      created_at: "2026-11-16T12:00:00Z",
    });

    renderWithAuth(<TeamPage />, { authenticated: true, route: "/team" });

    const addBtn = await screen.findByRole("button", { name: /Invite Staff/i });
    await user.click(addBtn);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    const inputs = within(dialog).getAllByRole("textbox");
    const firstNameInput = inputs[0]; // First Name
    const lastNameInput = inputs[1];  // Last Name
    const emailInput = inputs[2];     // Email Address

    await user.type(firstNameInput, "Emeka");
    await user.type(lastNameInput, "Tailor");
    await user.type(emailInput, "emeka@example.com");

    expect(within(dialog).queryByLabelText(/password/i)).not.toBeInTheDocument();
    const submitBtn = within(dialog).getByRole("button", { name: /Send Invitation/i });
    await user.click(submitBtn);

    await waitFor(
      () => {
        expect(teamApi.addStaffMember).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  });
});
