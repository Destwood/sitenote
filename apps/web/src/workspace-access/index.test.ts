import type { SitenoteClient } from "@sitenote/db";
import { describe, expect, it, vi } from "vitest";

import { readMemberships, readWorkspaceAccess } from ".";

const USER_ID = "u-1";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";

function clientReturning(result: unknown) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
  };
  const from = vi.fn(() => chain);
  return { client: { from } as unknown as SitenoteClient, from };
}

describe("readMemberships", () => {
  it("maps the memberships to workspace id, name and role", async () => {
    const { client, from } = clientReturning({
      data: [
        { role: "owner", workspaces: { id: WORKSPACE_ID, name: "Northwind" } },
        { role: "guest", workspaces: { id: "10000000-0000-4000-8000-000000000002", name: "Acme" } },
      ],
      error: null,
    });

    await expect(readMemberships(client, USER_ID)).resolves.toEqual([
      { id: WORKSPACE_ID, name: "Northwind", role: "owner" },
      { id: "10000000-0000-4000-8000-000000000002", name: "Acme", role: "guest" },
    ]);
    expect(from).toHaveBeenCalledWith("members");
  });

  it("returns null when the lookup fails", async () => {
    const { client } = clientReturning({ data: null, error: { message: "down" } });

    await expect(readMemberships(client, USER_ID)).resolves.toBeNull();
  });
});

describe("readWorkspaceAccess", () => {
  it("returns the workspace name and the role of the user", async () => {
    const { client } = clientReturning({
      data: { role: "member", workspaces: { name: "Northwind" } },
      error: null,
    });

    await expect(readWorkspaceAccess(client, USER_ID, WORKSPACE_ID)).resolves.toEqual({
      name: "Northwind",
      role: "member",
    });
  });

  it("returns null when the user is not in the workspace", async () => {
    const { client } = clientReturning({ data: null, error: null });

    await expect(readWorkspaceAccess(client, USER_ID, WORKSPACE_ID)).resolves.toBeNull();
  });

  it("throws instead of reporting a missing workspace when the lookup fails", async () => {
    const { client } = clientReturning({ data: null, error: { message: "down" } });

    await expect(readWorkspaceAccess(client, USER_ID, WORKSPACE_ID)).rejects.toThrow(
      "Could not read the workspace membership.",
    );
  });
});
