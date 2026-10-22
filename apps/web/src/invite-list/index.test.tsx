import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../invite-actions", () => ({ revokeInvite: vi.fn() }));

import { InviteList, formatInviteDate, type InviteListItem } from ".";

function at<Item>(items: readonly Item[], index: number): Item {
  const item = items.at(index);
  if (item === undefined) {
    throw new Error(`No item at ${String(index)}`);
  }
  return item;
}

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";

function invite(overrides: Partial<InviteListItem>): InviteListItem {
  return {
    id: "50000000-0000-4000-8000-000000000001",
    role: "guest",
    createdAt: "2026-10-22T09:30:00Z",
    expiresAt: "2026-10-29T09:30:00Z",
    status: "active",
    link: "http://localhost:3000/invite/abc",
    ...overrides,
  };
}

describe("InviteList", () => {
  it("says so when there are no invites", () => {
    render(<InviteList workspaceId={WORKSPACE_ID} invites={[]} />);

    expect(screen.getByText("No invites yet.")).toBeTruthy();
  });

  it("offers copy and revoke only for active invites", () => {
    render(
      <InviteList
        workspaceId={WORKSPACE_ID}
        invites={[
          invite({ id: "a", status: "active" }),
          invite({ id: "b", status: "expired", role: "member" }),
          invite({ id: "c", status: "revoked" }),
        ]}
      />,
    );

    const rows = screen.getAllByTestId("invite-row");
    expect(rows).toHaveLength(3);
    expect(within(at(rows, 0)).getByText("Active")).toBeTruthy();
    expect(within(at(rows, 0)).getByRole("button", { name: "Copy link" })).toBeTruthy();
    expect(within(at(rows, 0)).getByRole("button", { name: "Revoke" })).toBeTruthy();
    expect(within(at(rows, 1)).getByText("Member invite")).toBeTruthy();
    expect(within(at(rows, 1)).getByText("Expired")).toBeTruthy();
    expect(within(at(rows, 2)).getByText("Revoked")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Copy link" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(1);
  });

  it("shows the creation and expiry times in UTC", () => {
    render(<InviteList workspaceId={WORKSPACE_ID} invites={[invite({})]} />);

    expect(screen.getByText(formatInviteDate("2026-10-22T09:30:00Z"))).toBeTruthy();
    expect(formatInviteDate("2026-10-22T09:30:00Z")).toBe("22 Oct 2026, 09:30 UTC");
  });

  it("never prints the invite link of an inactive invite", () => {
    render(
      <InviteList
        workspaceId={WORKSPACE_ID}
        invites={[invite({ status: "revoked", link: "http://localhost:3000/invite/secret" })]}
      />,
    );

    expect(document.body.innerHTML).not.toContain("secret");
  });
});
