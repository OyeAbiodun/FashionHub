import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test } from "vitest";

import { Button, Dialog } from "./ui";

test("dialog traps focus, locks scrolling, and restores focus on Escape", async () => {
  const user = userEvent.setup();

  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open payment</Button>
        <Dialog
          open={open}
          title="Record Payment"
          description="Outstanding balance"
          onClose={() => setOpen(false)}
          footer={<Button>Confirm payment</Button>}
        />
      </>
    );
  }

  render(<Harness />);
  const trigger = screen.getByRole("button", { name: "Open payment" });
  await user.click(trigger);

  const dialog = screen.getByRole("dialog", { name: "Record Payment" });
  expect(dialog).toHaveAccessibleDescription("Outstanding balance");
  expect(document.body.style.overflow).toBe("hidden");
  expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();

  await user.tab({ shift: true });
  expect(screen.getByRole("button", { name: "Confirm payment" })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(document.body.style.overflow).toBe("");
});
