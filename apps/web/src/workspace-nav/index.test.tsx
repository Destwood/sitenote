import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkspaceNav } from ".";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";

describe("WorkspaceNav", () => {
  it("shows every section to an owner", () => {
    render(<WorkspaceNav workspaceId={WORKSPACE_ID} role="owner" />);

    const nav = screen.getByRole("navigation", { name: "Workspace sections" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Threads", "Sites", "Members", "Invites"]);
    expect(screen.getByRole("link", { name: "Invites" }).getAttribute("href")).toBe(
      `/app/w/${WORKSPACE_ID}/invites`,
    );
  });

  it.each(["member", "guest"] as const)("hides the invites section from a %s", (role) => {
    render(<WorkspaceNav workspaceId={WORKSPACE_ID} role={role} />);

    expect(screen.queryByRole("link", { name: "Invites" })).toBeNull();
    expect(screen.getByRole("link", { name: "Members" }).getAttribute("href")).toBe(
      `/app/w/${WORKSPACE_ID}/members`,
    );
  });
});
