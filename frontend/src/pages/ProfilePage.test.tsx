import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import * as authApi from "../api/auth";
import { renderWithAuth } from "../test/render";
import { ProfilePage } from "./ProfilePage";

vi.mock("../api/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof authApi>();
  return {
    ...actual,
    changePassword: vi.fn(),
  };
});

describe("ProfilePage", () => {
  it("renders initial user profile and business identity details", () => {
    renderWithAuth(<ProfilePage />, { authenticated: true, route: "/profile" });

    expect(screen.getByText("User Profile & Security")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ada")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Okafor")).toBeInTheDocument();
    expect(screen.getByDisplayValue("ada@example.com")).toBeDisabled();
    expect(screen.getByText("Ada Bespoke")).toBeInTheDocument();
  });

  it("submits profile update successfully", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ProfilePage />, { authenticated: true, route: "/profile" });

    const firstNameInput = screen.getByDisplayValue("Ada");
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Adanma");

    const saveBtn = screen.getByRole("button", { name: /Save Profile/i });
    expect(saveBtn).not.toBeDisabled();

    await user.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText("Profile updated successfully.")).toBeInTheDocument();
    });
  });

  it("handles password change submit flow", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.changePassword).mockResolvedValueOnce({
      message: "Password changed successfully.",
    });

    renderWithAuth(<ProfilePage />, { authenticated: true, route: "/profile" });

    const currentPw = screen.getByPlaceholderText("Enter current password");
    const newPw = screen.getByPlaceholderText("At least 8 characters");
    const confirmPw = screen.getByPlaceholderText("Re-enter new password");

    await user.type(currentPw, "OldSecret123!");
    await user.type(newPw, "NewSecret123!");
    await user.type(confirmPw, "NewSecret123!");

    const updatePwBtn = screen.getByRole("button", { name: /Update Password/i });
    await user.click(updatePwBtn);

    await waitFor(() => {
      expect(authApi.changePassword).toHaveBeenCalledWith({
        current_password: "OldSecret123!",
        new_password: "NewSecret123!",
      });
      expect(screen.getByText("Password changed successfully.")).toBeInTheDocument();
    });
  });
});
