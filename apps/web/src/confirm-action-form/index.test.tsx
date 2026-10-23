import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfirmActionForm } from ".";

const MESSAGE = "Remove this site?";

function stubConfirm(answer: boolean) {
  const confirm = vi.fn(() => answer);
  Object.defineProperty(window, "confirm", { configurable: true, value: confirm });
  return confirm;
}

afterEach(() => {
  Reflect.deleteProperty(window, "confirm");
});

describe("ConfirmActionForm", () => {
  it("sends the hidden fields and the action after the user confirms", async () => {
    const confirm = stubConfirm(true);
    const action = vi.fn(() => Promise.resolve({ error: null }));
    const user = userEvent.setup();
    const { container } = render(
      <ConfirmActionForm
        action={action}
        fields={{ siteId: "site-1" }}
        confirmMessage={MESSAGE}
        label="Remove"
        pendingLabel="Removing..."
      />,
    );

    expect(container.querySelector('input[name="siteId"]')?.getAttribute("value")).toBe("site-1");
    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(confirm).toHaveBeenCalledWith(MESSAGE);
    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(1);
    });
  });

  it("does not run the action when the user cancels", async () => {
    const confirm = stubConfirm(false);
    const action = vi.fn(() => Promise.resolve({ error: null }));
    const user = userEvent.setup();
    render(
      <ConfirmActionForm
        action={action}
        fields={{}}
        confirmMessage={MESSAGE}
        label="Remove"
        pendingLabel="Removing..."
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(confirm).toHaveBeenCalledWith(MESSAGE);
    expect(action).not.toHaveBeenCalled();
  });
});
