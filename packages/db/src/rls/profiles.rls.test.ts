import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CHECK_VIOLATION,
  createAnonymousTestUser,
  createPublicClient,
  createScenario,
  createTestUser,
  deleteTestUsers,
  destroyScenario,
  expectCode,
  expectNoRows,
  expectOneRow,
  expectPermissionDenied,
  unwrap,
  type Scenario,
  type TestUser,
} from "../test-harness";

const PUBLIC_COLUMNS = "user_id, display_name, avatar_url";

let scenario: Scenario;
const extraUsers: TestUser[] = [];

beforeAll(async () => {
  scenario = await createScenario();
});

afterAll(async () => {
  await deleteTestUsers(scenario.admin, extraUsers);
  await destroyScenario(scenario);
});

async function profileOf(userId: string) {
  return unwrap(await scenario.admin.from("profiles").select("*").eq("user_id", userId).single());
}

describe("profiles select", () => {
  it("lets a user read their own profile", async () => {
    const result = await scenario.owner.client
      .from("profiles")
      .select(PUBLIC_COLUMNS)
      .eq("user_id", scenario.owner.id);
    expectOneRow(result);
    expect(result.data?.[0]?.display_name).toBe("Olive Owner");
  });

  it("lets members, guests and the owner read each other's profiles", async () => {
    for (const reader of [scenario.owner, scenario.member, scenario.guest]) {
      const result = await reader.client
        .from("profiles")
        .select(PUBLIC_COLUMNS)
        .in("user_id", [scenario.owner.id, scenario.member.id, scenario.guest.id]);
      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(3);
    }
  });

  it("hides profiles of other workspaces from an outsider", async () => {
    const result = await scenario.outsider.client
      .from("profiles")
      .select(PUBLIC_COLUMNS)
      .in("user_id", [scenario.owner.id, scenario.member.id, scenario.guest.id]);
    expectNoRows(result);
  });

  it("hides every other profile from an anonymous non-member", async () => {
    const result = await scenario.stranger.client.from("profiles").select(PUBLIC_COLUMNS);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      expect.objectContaining({ user_id: scenario.stranger.id, display_name: "Guest" }),
    ]);
  });

  it("denies the unauthenticated role", async () => {
    expectPermissionDenied(await createPublicClient().from("profiles").select(PUBLIC_COLUMNS));
  });

  it("never exposes the email column to clients", async () => {
    expectPermissionDenied(await scenario.owner.client.from("profiles").select("user_id, email"));
    expectPermissionDenied(await scenario.owner.client.from("profiles").select("*"));
    expectPermissionDenied(
      await scenario.owner.client.from("profiles").select("user_id").eq("email", "x@y.z"),
    );
  });
});

describe("profiles insert and delete", () => {
  it("cannot be inserted by clients", async () => {
    expectPermissionDenied(
      await scenario.stranger.client
        .from("profiles")
        .insert({ user_id: scenario.stranger.id, display_name: "Second" }),
    );
  });

  it("cannot be deleted by clients", async () => {
    expectPermissionDenied(
      await scenario.owner.client.from("profiles").delete().eq("user_id", scenario.owner.id),
    );
  });
});

describe("profiles update", () => {
  it("lets a user change their own display name and avatar", async () => {
    const result = await scenario.member.client
      .from("profiles")
      .update({ display_name: "Milo M.", avatar_url: "https://cdn.example/milo.png" })
      .eq("user_id", scenario.member.id)
      .select(PUBLIC_COLUMNS);
    expectOneRow(result);
    const row = await profileOf(scenario.member.id);
    expect(row.display_name).toBe("Milo M.");
    expect(row.avatar_url).toBe("https://cdn.example/milo.png");
  });

  it("does not touch another user's profile", async () => {
    const result = await scenario.member.client
      .from("profiles")
      .update({ display_name: "Hijacked" })
      .eq("user_id", scenario.owner.id)
      .select(PUBLIC_COLUMNS);
    expectNoRows(result);
    expect((await profileOf(scenario.owner.id)).display_name).toBe("Olive Owner");
  });

  it("denies changing the email or the user id", async () => {
    expectPermissionDenied(
      await scenario.member.client
        .from("profiles")
        .update({ email: "attacker@example.com" })
        .eq("user_id", scenario.member.id),
    );
    expectPermissionDenied(
      await scenario.member.client
        .from("profiles")
        .update({ user_id: scenario.owner.id })
        .eq("user_id", scenario.member.id),
    );
  });

  it("rejects invalid display names and avatar urls", async () => {
    const own = scenario.guest.id;
    for (const name of ["", "   ", "x".repeat(81)]) {
      expectCode(
        await scenario.guest.client
          .from("profiles")
          .update({ display_name: name })
          .eq("user_id", own),
        CHECK_VIOLATION,
      );
    }
    for (const url of [
      "http://cdn.example/a.png",
      "javascript:alert(1)",
      `https://x.example/${"a".repeat(2100)}`,
    ]) {
      expectCode(
        await scenario.guest.client.from("profiles").update({ avatar_url: url }).eq("user_id", own),
        CHECK_VIOLATION,
      );
    }
  });

  it("refreshes updated_at", async () => {
    const before = await profileOf(scenario.guest.id);
    await scenario.guest.client
      .from("profiles")
      .update({ display_name: "Guest renamed" })
      .eq("user_id", scenario.guest.id);
    const after = await profileOf(scenario.guest.id);
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(
      new Date(before.updated_at).getTime(),
    );
  });
});

describe("profile creation from auth users", () => {
  it("uses full_name from the user metadata", async () => {
    const user = await createTestUser(scenario.admin, "fullname", {
      full_name: "  Ada Lovelace  ",
      name: "Ignored",
    });
    extraUsers.push(user);
    const row = await profileOf(user.id);
    expect(row.display_name).toBe("Ada Lovelace");
    expect(row.email).toBe(user.email);
  });

  it("falls back to name, then to the email local part, then to Guest", async () => {
    const named = await createTestUser(scenario.admin, "named", { name: "Grace Hopper" });
    const plain = await createTestUser(scenario.admin, "plain-label");
    const blank = await createTestUser(scenario.admin, "blank", { full_name: " \t ", name: "" });
    extraUsers.push(named, plain, blank);
    expect((await profileOf(named.id)).display_name).toBe("Grace Hopper");
    expect((await profileOf(plain.id)).display_name).toMatch(/^plain-label-/);
    expect((await profileOf(blank.id)).display_name).toMatch(/^blank-/);
    expect((await profileOf(scenario.stranger.id)).display_name).toBe("Guest");
    expect((await profileOf(scenario.stranger.id)).email).toBeNull();
  });

  it("truncates very long names to 80 characters", async () => {
    const user = await createTestUser(scenario.admin, "long", { full_name: "n".repeat(200) });
    extraUsers.push(user);
    expect((await profileOf(user.id)).display_name).toHaveLength(80);
  });

  it("copies only https avatars", async () => {
    const secure = await createTestUser(scenario.admin, "avatar-https", {
      picture: "https://lh3.example/a.png",
    });
    const insecure = await createTestUser(scenario.admin, "avatar-http", {
      avatar_url: "http://lh3.example/a.png",
    });
    const script = await createTestUser(scenario.admin, "avatar-js", {
      avatar_url: "javascript:alert(1)",
    });
    extraUsers.push(secure, insecure, script);
    expect((await profileOf(secure.id)).avatar_url).toBe("https://lh3.example/a.png");
    expect((await profileOf(insecure.id)).avatar_url).toBeNull();
    expect((await profileOf(script.id)).avatar_url).toBeNull();
  });

  it("keeps the email in sync with the auth user", async () => {
    const user = await createTestUser(scenario.admin, "sync");
    extraUsers.push(user);
    const email = `renamed-${randomUUID()}@rls.sitenote.test`;
    const updated = await scenario.admin.auth.admin.updateUserById(user.id, {
      email,
      email_confirm: true,
    });
    expect(updated.error).toBeNull();
    expect((await profileOf(user.id)).email).toBe(email);
  });

  it("removes the profile together with the auth user", async () => {
    const user = await createAnonymousTestUser();
    expect((await profileOf(user.id)).display_name).toBe("Guest");
    await deleteTestUsers(scenario.admin, [user]);
    const result = await scenario.admin.from("profiles").select("user_id").eq("user_id", user.id);
    expectNoRows(result);
  });
});
