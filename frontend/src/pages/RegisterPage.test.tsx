import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RegisterPage } from "./RegisterPage";
import { renderWithAuth } from "../test/render";

test("registration wizard step 1 validation and navigation to step 2", async () => {
  renderWithAuth(<RegisterPage />);

  // Clicking continue on Step 1 without filling fields triggers validation
  await userEvent.click(
    screen.getByRole("button", { name: /continue to business details/i }),
  );
  expect(
    await screen.findByText(/first name is required/i),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/password must be at least 8 characters/i),
  ).toBeInTheDocument();

  // Fill Step 1 valid values
  await userEvent.type(screen.getByPlaceholderText("Ada"), "Ada");
  await userEvent.type(screen.getByPlaceholderText("Obi"), "Obi");
  await userEvent.type(screen.getByPlaceholderText("owner@adabespoke.ng"), "ada@example.com");
  await userEvent.type(screen.getByPlaceholderText("At least 8 characters"), "Password123!");
  await userEvent.type(screen.getByPlaceholderText("Re-enter password"), "Password123!");

  // Proceed to Step 2
  await userEvent.click(
    screen.getByRole("button", { name: /continue to business details/i }),
  );

  // Expect Step 2 business fields to be displayed
  expect(await screen.findByPlaceholderText("Ada Bespoke Couture")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Business phone e.g. +234 801 234 5678")).toBeInTheDocument();

  // Submitting on Step 2 without business name triggers business validation
  await userEvent.click(
    screen.getByRole("button", { name: /create account/i }),
  );
  expect(await screen.findByText(/business name is required/i)).toBeInTheDocument();
});
