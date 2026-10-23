import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../member-actions", () => ({ setMemberRole: vi.fn() }));

import { MemberRoleForm } from ".";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const MEMBER_ID = "40000000-0000-4000-8000-000000000001";

describe("MemberRoleForm", () => {
  it("offers member and guest with the current role selected", () => {
    render(<MemberRoleForm workspaceId={WORKSPACE_ID} userId={MEMBER_ID} role="guest" />);

    const select = screen.getByLabelText<HTMLSelectElement>("Role");
    expect(select.value).toBe("guest");
    expect(screen.getByRole("option", { name: "Member" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Owner" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save role" })).toBeTruthy();
  });
});
