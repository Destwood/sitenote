import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: mocks.pathname }));

import { WorkspaceNav } from ".";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  mocks.pathname.mockReturnValue(`/app/w/${WORKSPACE_ID}/threads`);
});

describe("WorkspaceNav", () => {
  it("shows every section to an owner", () => {
    render(<WorkspaceNav workspaceId={WORKSPACE_ID} role="owner" />);

    const nav = screen.getByRole("navigation", { name: "Workspace sections" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Threads", "Sites", "Members", "Invites", "Integrations"]);
    expect(screen.getByRole("link", { name: "Invites" }).getAttribute("href")).toBe(
      `/app/w/${WORKSPACE_ID}/invites`,
    );
  });

  it.each(["member", "guest"] as const)("hides the invites section from a %s", (role) => {
    render(<WorkspaceNav workspaceId={WORKSPACE_ID} role={role} />);

    expect(screen.queryByRole("link", { name: "Invites" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Integrations" })).toBeNull();
    expect(screen.getByRole("link", { name: "Members" }).getAttribute("href")).toBe(
      `/app/w/${WORKSPACE_ID}/members`,
    );
  });

  it("marks the section of the current path as the current page", () => {
    mocks.pathname.mockReturnValue(`/app/w/${WORKSPACE_ID}/threads/abc`);
    render(<WorkspaceNav workspaceId={WORKSPACE_ID} role="member" />);

    expect(screen.getByRole("link", { name: "Threads" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Sites" }).getAttribute("aria-current")).toBeNull();
  });
});
