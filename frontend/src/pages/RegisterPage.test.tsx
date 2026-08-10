import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RegisterPage } from "./RegisterPage";
import { renderWithAuth } from "../test/render";

test("registration form validation", async () => {
  renderWithAuth(<RegisterPage />);
  await userEvent.click(
    screen.getByRole("button", { name: /create account/i }),
  );
  expect(
    await screen.findByText(/first name is required/i),
  ).toBeInTheDocument();
  expect(screen.getByText(/business name is required/i)).toBeInTheDocument();
  expect(
    screen.getByText(/password must be at least 8 characters/i),
  ).toBeInTheDocument();
});
