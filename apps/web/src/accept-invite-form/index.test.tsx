import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acceptInvite: vi.fn<(previous: unknown, data: FormData) => Promise<{ error: string | null }>>(),
}));

vi.mock("../invite-actions", () => ({ acceptInvite: mocks.acceptInvite }));

import { AcceptInviteForm } from ".";

const TOKEN = "a".repeat(48);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.acceptInvite.mockResolvedValue({ error: null });
});

describe("AcceptInviteForm", () => {
  it("names the workspace and the role on the button", () => {
    render(<AcceptInviteForm token={TOKEN} workspaceName="Northwind Studio" role="member" />);

    expect(screen.getByRole("button", { name: "Join Northwind Studio as member" })).toBeTruthy();
    expect(screen.getByRole("heading").textContent).toContain("Northwind Studio");
  });

  it("submits the token", async () => {
    const user = userEvent.setup();
    render(<AcceptInviteForm token={TOKEN} workspaceName="Northwind Studio" role="guest" />);

    await user.click(screen.getByRole("button", { name: "Join Northwind Studio as guest" }));

    await waitFor(() => {
      expect(mocks.acceptInvite).toHaveBeenCalledOnce();
    });
    expect(mocks.acceptInvite.mock.calls[0]?.[1].get("token")).toBe(TOKEN);
  });

  it("shows the error the action returns", async () => {
    mocks.acceptInvite.mockResolvedValue({ error: "This invite link is invalid or has expired." });
    const user = userEvent.setup();
    render(<AcceptInviteForm token={TOKEN} workspaceName="Northwind Studio" role="guest" />);

    await user.click(screen.getByRole("button", { name: "Join Northwind Studio as guest" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "This invite link is invalid or has expired.",
    );
  });
});
