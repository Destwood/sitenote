import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../member-actions", () => ({
  setMemberRole: vi.fn(),
  removeMember: vi.fn(),
  leaveWorkspace: vi.fn(),
}));

import { MemberList, YOU_LABEL } from ".";
import type { WorkspaceMember } from "../workspace-members";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const OWNER_ID = "u-1";
const MEMBER_ID = "u-2";
const GUEST_ID = "u-3";

const MEMBERS: WorkspaceMember[] = [
  { userId: OWNER_ID, displayName: "Olena", role: "owner", joinedAt: "2026-10-01T09:00:00Z" },
  { userId: MEMBER_ID, displayName: "Max", role: "member", joinedAt: "2026-10-02T09:00:00Z" },
  { userId: GUEST_ID, displayName: "Gina", role: "guest", joinedAt: "2026-10-03T09:00:00Z" },
];

function rowOf(name: string): HTMLElement {
  const row = screen.getByText(name, { exact: false }).closest("li");
  if (row === null) {
    throw new Error(`No row for ${name}`);
  }
  return row;
}

describe("MemberList for an owner", () => {
  it("lets the owner change roles and remove every member but the owner", () => {
    render(
      <MemberList
        workspaceId={WORKSPACE_ID}
        members={MEMBERS}
        viewerId={OWNER_ID}
        viewerRole="owner"
      />,
    );

    expect(within(rowOf("Olena")).queryByRole("button")).toBeNull();
    expect(within(rowOf("Max")).getByRole("button", { name: "Save role" })).toBeTruthy();
    expect(
      within(rowOf("Max")).getByRole("button", { name: "Remove from workspace" }),
    ).toBeTruthy();
    expect(
      within(rowOf("Gina")).getByRole("button", { name: "Remove from workspace" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Leave workspace" })).toBeNull();
  });

  it("marks the viewer's own row", () => {
    render(
      <MemberList
        workspaceId={WORKSPACE_ID}
        members={MEMBERS}
        viewerId={OWNER_ID}
        viewerRole="owner"
      />,
    );

    expect(rowOf("Olena").textContent).toContain(YOU_LABEL);
    expect(rowOf("Max").textContent).not.toContain(YOU_LABEL);
  });
});

describe("MemberList for a member or guest", () => {
  it("shows only the member's own leave action", () => {
    render(
      <MemberList
        workspaceId={WORKSPACE_ID}
        members={MEMBERS}
        viewerId={MEMBER_ID}
        viewerRole="member"
      />,
    );

    expect(within(rowOf("Max")).getByRole("button", { name: "Leave workspace" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save role" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove from workspace" })).toBeNull();
    expect(within(rowOf("Gina")).queryByRole("button")).toBeNull();
  });

  it("lets a guest leave but not manage anyone", () => {
    render(
      <MemberList
        workspaceId={WORKSPACE_ID}
        members={MEMBERS}
        viewerId={GUEST_ID}
        viewerRole="guest"
      />,
    );

    expect(within(rowOf("Gina")).getByRole("button", { name: "Leave workspace" })).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
