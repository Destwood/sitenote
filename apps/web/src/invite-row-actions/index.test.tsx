import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revokeInvite: vi.fn<(previous: unknown, data: FormData) => Promise<{ error: string | null }>>(),
}));

vi.mock("../invite-actions", () => ({ revokeInvite: mocks.revokeInvite }));

import { InviteRowActions } from ".";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const INVITE_ID = "50000000-0000-4000-8000-000000000001";
const LINK = `http://localhost:3000/invite/${"a".repeat(48)}`;

function setup() {
  const user = userEvent.setup();
  const view = render(
    <InviteRowActions workspaceId={WORKSPACE_ID} inviteId={INVITE_ID} link={LINK} />,
  );
  return { user, view };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.revokeInvite.mockResolvedValue({ error: null });
});

describe("copy link", () => {
  it("writes the link to the clipboard and confirms it", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Link copied.");
    expect(await navigator.clipboard.readText()).toBe(LINK);
    expect(screen.queryByLabelText(/Copying is blocked/)).toBeNull();
  });

  it("shows a selectable read-only field with the link when the clipboard rejects", async () => {
    const { user } = setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));

    await user.click(screen.getByRole("button", { name: "Copy link" }));

    const field = await screen.findByLabelText(/Copying is blocked/);
    expect(field).toHaveProperty("value", LINK);
    expect(field).toHaveProperty("readOnly", true);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the fallback field when the browser has no clipboard", async () => {
    const { user } = setup();
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });

    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(await screen.findByLabelText(/Copying is blocked/)).toHaveProperty("value", LINK);
  });
});

describe("revoke", () => {
  it("submits the workspace and invite ids to the revoke action", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() => {
      expect(mocks.revokeInvite).toHaveBeenCalledOnce();
    });
    const formData = mocks.revokeInvite.mock.calls[0]?.[1];
    expect(formData?.get("workspaceId")).toBe(WORKSPACE_ID);
    expect(formData?.get("inviteId")).toBe(INVITE_ID);
  });

  it("shows the error the action returns", async () => {
    mocks.revokeInvite.mockResolvedValue({ error: "This invite was already revoked." });
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Revoke" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "This invite was already revoked.",
    );
  });
});
