import type { SitenoteClient } from "@sitenote/db";
import { describe, expect, it, vi } from "vitest";

import { memberNames, readWorkspaceMembers, type WorkspaceMember } from ".";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";

function clientReturning(result: unknown) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => Promise.resolve(result),
  };
  const from = vi.fn(() => chain);
  return { client: { from } as unknown as SitenoteClient, from };
}

describe("readWorkspaceMembers", () => {
  it("maps each membership with its display name in join order", async () => {
    const { client, from } = clientReturning({
      data: [
        {
          user_id: "u-1",
          role: "owner",
          created_at: "2026-10-01T09:00:00Z",
          profiles: { display_name: "Olena" },
        },
        {
          user_id: "u-2",
          role: "guest",
          created_at: "2026-10-02T09:00:00Z",
          profiles: { display_name: "Max" },
        },
      ],
      error: null,
    });

    await expect(readWorkspaceMembers(client, WORKSPACE_ID)).resolves.toEqual([
      { userId: "u-1", displayName: "Olena", role: "owner", joinedAt: "2026-10-01T09:00:00Z" },
      { userId: "u-2", displayName: "Max", role: "guest", joinedAt: "2026-10-02T09:00:00Z" },
    ]);
    expect(from).toHaveBeenCalledWith("members");
  });

  it("throws when the members cannot be read", async () => {
    const { client } = clientReturning({ data: null, error: { message: "down" } });

    await expect(readWorkspaceMembers(client, WORKSPACE_ID)).rejects.toThrow(
      "Could not read the workspace members.",
    );
  });
});

describe("memberNames", () => {
  it("maps user ids to display names", () => {
    const members: WorkspaceMember[] = [
      { userId: "u-1", displayName: "Olena", role: "owner", joinedAt: "2026-10-01T09:00:00Z" },
      { userId: "u-2", displayName: "Max", role: "member", joinedAt: "2026-10-02T09:00:00Z" },
    ];

    expect(memberNames(members).get("u-2")).toBe("Max");
    expect(memberNames(members).get("u-3")).toBeUndefined();
  });
});
