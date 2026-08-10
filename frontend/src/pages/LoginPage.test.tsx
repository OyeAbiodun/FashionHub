import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LoginPage } from "./LoginPage";
import { renderWithAuth } from "../test/render";

test("login form validation", async () => {
  renderWithAuth(<LoginPage />);
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
  expect(
    await screen.findByText(/enter a valid email address/i),
  ).toBeInTheDocument();
  expect(screen.getByText(/password is required/i)).toBeInTheDocument();
});
