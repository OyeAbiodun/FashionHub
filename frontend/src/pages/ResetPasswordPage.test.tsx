import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { ResetPasswordPage } from "./ResetPasswordPage";
import * as authApi from "../api/auth";
import { renderWithAuth } from "../test/render";

test("reset password validation, password mismatch, and success flow", async () => {
  const resetPasswordSpy = vi.spyOn(authApi, "resetPassword").mockResolvedValueOnce({
    message: "Password has been successfully reset.",
  });

  renderWithAuth(<ResetPasswordPage />);

  // Should show reset token input when query string has no token
  const tokenInput = screen.getByLabelText("Reset Token");
  await userEvent.type(tokenInput, "test-token-123");

  const newPasswordInput = screen.getByLabelText("New Password");
  const confirmPasswordInput = screen.getByLabelText("Confirm New Password");

  // Mismatched passwords
  await userEvent.type(newPasswordInput, "NewSecretPass123!");
  await userEvent.type(confirmPasswordInput, "DifferentPass123!");
  await userEvent.click(screen.getByRole("button", { name: /reset password/i }));

  expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();

  // Fix confirm password
  await userEvent.clear(confirmPasswordInput);
  await userEvent.type(confirmPasswordInput, "NewSecretPass123!");
  await userEvent.click(screen.getByRole("button", { name: /reset password/i }));

  expect(resetPasswordSpy).toHaveBeenCalledWith("test-token-123", "NewSecretPass123!");
  expect(await screen.findByText(/password reset complete/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /sign in with new password/i })).toBeInTheDocument();
});
