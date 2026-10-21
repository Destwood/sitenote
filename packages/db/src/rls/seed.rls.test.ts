import { describe, expect, it } from "vitest";

import { anchorSchema } from "@sitenote/core";

import { createPublicClient, expectNoRows, unwrap, type TestUser } from "../test-harness";

const PASSWORD = "sitenote-dev-password";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";

async function signIn(name: string): Promise<TestUser> {
  const client = createPublicClient();
  const email = `${name}@sitenote.test`;
  const session = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (session.error !== null) {
    throw session.error;
  }
  return { id: session.data.user.id, email, client };
}

describe("seed data", () => {
  it("lets every seeded user sign in with the documented password", async () => {
    for (const name of ["owner", "member", "guest", "outsider"]) {
      const user = await signIn(name);
      expect(user.id).toMatch(/^00000000-0000-4000-8000-00000000000[1-4]$/);
    }
  });

  it("gives the owner, member and guest the same view of Northwind Studio", async () => {
    for (const name of ["owner", "member", "guest"]) {
      const user = await signIn(name);
      const workspaces = unwrap(await user.client.from("workspaces").select("id, name"));
      expect(workspaces).toEqual([{ id: WORKSPACE_ID, name: "Northwind Studio" }]);
      const sites = unwrap(await user.client.from("sites").select("origin").order("origin"));
      expect(sites).toEqual([
        { origin: "http://127.0.0.1:4173" },
        { origin: "http://localhost:4173" },
      ]);
      const threads = unwrap(await user.client.from("threads").select("id, status"));
      expect(threads.filter((thread) => thread.status === "open")).toHaveLength(3);
      expect(threads.filter((thread) => thread.status === "resolved")).toHaveLength(1);
      const comments = unwrap(await user.client.from("comments").select("id, thread_id"));
      expect(comments).toHaveLength(8);
    }
  });

  it("assigns the documented roles", async () => {
    const owner = await signIn("owner");
    const members = unwrap(
      await owner.client.from("members").select("role, profiles(display_name)").order("role"),
    );
    expect(members.map((member) => member.role).sort()).toEqual(["guest", "member", "owner"]);
  });

  it("hides the workspace from the outsider", async () => {
    const outsider = await signIn("outsider");
    expectNoRows(await outsider.client.from("workspaces").select("id"));
    expectNoRows(await outsider.client.from("threads").select("id"));
    expectNoRows(await outsider.client.from("comments").select("id"));
  });

  it("stores anchors that are valid element and text anchors", async () => {
    const owner = await signIn("owner");
    const threads = unwrap(await owner.client.from("threads").select("id, anchor, page_url"));
    expect(threads).toHaveLength(4);
    const kinds = new Set<string>();
    for (const thread of threads) {
      const anchor = anchorSchema.parse(thread.anchor);
      kinds.add(anchor.kind);
      expect(thread.page_url.startsWith("http://127.0.0.1:4173")).toBe(true);
    }
    expect([...kinds].sort()).toEqual(["element", "text"]);
  });

  it("records who resolved the resolved thread", async () => {
    const owner = await signIn("owner");
    const resolved = unwrap(
      await owner.client
        .from("threads")
        .select("resolved_by, resolved_at")
        .eq("status", "resolved")
        .single(),
    );
    expect(resolved.resolved_by).toBe(owner.id);
    expect(resolved.resolved_at).not.toBeNull();
  });
});
