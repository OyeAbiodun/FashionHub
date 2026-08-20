import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { ForgotPasswordPage } from "./ForgotPasswordPage";
import * as authApi from "../api/auth";
import { renderWithAuth } from "../test/render";

test("forgot password form validation and submission", async () => {
  renderWithAuth(<ForgotPasswordPage />);

  // Submit without entering email
  await userEvent.click(screen.getByRole("button", { name: /send reset instructions/i }));
  expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();

  // Mock successful API response
  const forgotPasswordSpy = vi.spyOn(authApi, "forgotPassword").mockResolvedValueOnce({
    message: "If an account exists with this email, password reset instructions have been generated.",
  });

  const emailInput = screen.getByLabelText(/registered email/i);
  await userEvent.type(emailInput, "owner@example.com");
  await userEvent.click(screen.getByRole("button", { name: /send reset instructions/i }));

  expect(forgotPasswordSpy).toHaveBeenCalledWith("owner@example.com");
  expect(await screen.findByText(/password reset instructions have been generated/i)).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /reset password now/i })).not.toBeInTheDocument();
});
