import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createInvite: vi.fn<(previous: unknown, data: FormData) => Promise<{ error: string | null }>>(),
}));

vi.mock("../invite-actions", () => ({ createInvite: mocks.createInvite }));

import { CreateInviteForm } from ".";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createInvite.mockResolvedValue({ error: null });
});

describe("CreateInviteForm", () => {
  it("offers the member and guest roles and 1, 7 and 30 day expiries with 7 days preselected", () => {
    render(<CreateInviteForm workspaceId={WORKSPACE_ID} />);

    const role = screen.getByLabelText<HTMLSelectElement>("Role");
    const expiry = screen.getByLabelText<HTMLSelectElement>("Expires in");
    expect([...role.options].map((option) => option.value)).toEqual(["member", "guest"]);
    expect([...expiry.options].map((option) => option.value)).toEqual(["1", "7", "30"]);
    expect(expiry.value).toBe("7");
    expect(role.value).toBe("guest");
  });

  it("submits the chosen role, expiry and workspace", async () => {
    const user = userEvent.setup();
    render(<CreateInviteForm workspaceId={WORKSPACE_ID} />);

    await user.selectOptions(screen.getByLabelText("Role"), "member");
    await user.selectOptions(screen.getByLabelText("Expires in"), "30");
    await user.click(screen.getByRole("button", { name: "Create invite link" }));

    await waitFor(() => {
      expect(mocks.createInvite).toHaveBeenCalledOnce();
    });
    const formData = mocks.createInvite.mock.calls[0]?.[1];
    expect(formData?.get("workspaceId")).toBe(WORKSPACE_ID);
    expect(formData?.get("role")).toBe("member");
    expect(formData?.get("expiresInDays")).toBe("30");
  });

  it("shows the error the action returns", async () => {
    mocks.createInvite.mockResolvedValue({ error: "Only the workspace owner can create invites." });
    const user = userEvent.setup();
    render(<CreateInviteForm workspaceId={WORKSPACE_ID} />);

    await user.click(screen.getByRole("button", { name: "Create invite link" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Only the workspace owner can create invites.",
    );
  });
});
