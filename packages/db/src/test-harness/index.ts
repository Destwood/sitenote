import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { expect } from "vitest";

import { createSitenoteClient, type SitenoteClient, type SitenoteClientOptions } from "../client";
import type { Enums, Json, Tables, TablesInsert } from "../database-types";

export const PERMISSION_DENIED = "42501";
export const CHECK_VIOLATION = "23514";
export const UNIQUE_VIOLATION = "23505";

const CLIENT_OPTIONS: SitenoteClientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

export interface TestEnv {
  url: string;
  publishableKey: string;
  secretKey: string;
  dbUrl: string;
}

export interface TestUser {
  id: string;
  email: string | null;
  client: SitenoteClient;
}

export interface Scenario {
  admin: SitenoteClient;
  owner: TestUser;
  member: TestUser;
  guest: TestUser;
  outsider: TestUser;
  stranger: TestUser;
  workspaceId: string;
  site: Tables<"sites">;
  otherWorkspaceId: string;
  otherSite: Tables<"sites">;
  users: TestUser[];
  storagePaths: string[];
}

interface ErrorLike {
  code: string;
  message: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is not set. Run "pnpm db:start" and then "pnpm db:env".`);
  }
  return value;
}

export function readTestEnv(): TestEnv {
  return {
    url: requireEnv("SUPABASE_URL"),
    publishableKey: requireEnv("SUPABASE_PUBLISHABLE_KEY"),
    secretKey: requireEnv("SUPABASE_SECRET_KEY"),
    dbUrl: requireEnv("SUPABASE_DB_URL"),
  };
}

export function createAdminClient(): SitenoteClient {
  const env = readTestEnv();
  return createSitenoteClient(env.url, env.secretKey, CLIENT_OPTIONS);
}

export function createPublicClient(): SitenoteClient {
  const env = readTestEnv();
  return createSitenoteClient(env.url, env.publishableKey, CLIENT_OPTIONS);
}

export async function withDb<T>(run: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: readTestEnv().dbUrl });
  await db.connect();
  try {
    return await run(db);
  } finally {
    await db.end();
  }
}

export function unwrap<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (result.error !== null) {
    throw new Error(result.error.message);
  }
  if (result.data === null || result.data === undefined) {
    throw new Error("Expected data but received none");
  }
  return result.data;
}

export async function createTestUser(
  admin: SitenoteClient,
  label: string,
  userMetadata: Record<string, unknown> = {},
): Promise<TestUser> {
  const email = `${label}-${randomUUID()}@rls.sitenote.test`;
  const password = randomUUID();
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: userMetadata,
  });
  if (created.error !== null) {
    throw created.error;
  }
  const client = createPublicClient();
  const session = await client.auth.signInWithPassword({ email, password });
  if (session.error !== null) {
    throw session.error;
  }
  return { id: created.data.user.id, email, client };
}

export async function createAnonymousTestUser(): Promise<TestUser> {
  const client = createPublicClient();
  const session = await client.auth.signInAnonymously();
  if (session.error !== null) {
    throw session.error;
  }
  if (session.data.user === null) {
    throw new Error("Anonymous sign-in returned no user");
  }
  return { id: session.data.user.id, email: null, client };
}

export async function deleteTestUsers(
  admin: SitenoteClient,
  users: readonly TestUser[],
): Promise<void> {
  for (const user of users) {
    const result = await admin.auth.admin.deleteUser(user.id);
    if (result.error !== null) {
      throw result.error;
    }
  }
}

export const ELEMENT_ANCHOR: NonNullable<Json> = {
  kind: "element",
  selectors: {
    css: "#cta",
    nthPath: "body > main:nth-of-type(1) > section:nth-of-type(1) > button:nth-of-type(1)",
    id: "cta",
  },
  fingerprint: { tag: "button", text: "Book a call", classes: ["cta"], width: 127, height: 50 },
  offset: { x: 0.5, y: 0.5 },
};

export const TEXT_ANCHOR: NonNullable<Json> = {
  kind: "text",
  quote: {
    exact: "redesign of a logistics dashboard",
    prefix: "A ",
    suffix: " that cut the time",
  },
  position: { start: 839, end: 872 },
  container: "#work > p",
};

export function randomOrigin(): string {
  return `https://${randomUUID().slice(0, 12)}.example`;
}

export async function insertWorkspace(
  admin: SitenoteClient,
  ownerId: string,
  name = "Test Workspace",
): Promise<string> {
  const row = unwrap(
    await admin.from("workspaces").insert({ name, owner_id: ownerId }).select("id").single(),
  );
  return row.id;
}

export async function insertMember(
  admin: SitenoteClient,
  workspaceId: string,
  userId: string,
  role: Enums<"member_role">,
): Promise<void> {
  unwrap(
    await admin
      .from("members")
      .insert({ workspace_id: workspaceId, user_id: userId, role })
      .select("id")
      .single(),
  );
}

export async function insertSite(
  admin: SitenoteClient,
  workspaceId: string,
  origin = randomOrigin(),
): Promise<Tables<"sites">> {
  return unwrap(
    await admin.from("sites").insert({ workspace_id: workspaceId, origin }).select("*").single(),
  );
}

export function buildThread(
  site: Pick<Tables<"sites">, "id" | "workspace_id" | "origin">,
  createdBy: string,
  overrides: Partial<TablesInsert<"threads">> = {},
): TablesInsert<"threads"> {
  return {
    id: randomUUID(),
    workspace_id: site.workspace_id,
    site_id: site.id,
    page_url: `${site.origin}/pricing`,
    anchor: ELEMENT_ANCHOR,
    created_by: createdBy,
    ...overrides,
  };
}

export async function insertThread(
  admin: SitenoteClient,
  site: Pick<Tables<"sites">, "id" | "workspace_id" | "origin">,
  createdBy: string,
  overrides: Partial<TablesInsert<"threads">> = {},
): Promise<Tables<"threads">> {
  return unwrap(
    await admin
      .from("threads")
      .insert(buildThread(site, createdBy, overrides))
      .select("*")
      .single(),
  );
}

export async function insertComment(
  admin: SitenoteClient,
  thread: Pick<Tables<"threads">, "id" | "workspace_id">,
  authorId: string,
  overrides: Partial<TablesInsert<"comments">> = {},
): Promise<Tables<"comments">> {
  return unwrap(
    await admin
      .from("comments")
      .insert({
        thread_id: thread.id,
        workspace_id: thread.workspace_id,
        author_id: authorId,
        body: "A comment from the fixture",
        ...overrides,
      })
      .select("*")
      .single(),
  );
}

export async function createScenario(): Promise<Scenario> {
  const admin = createAdminClient();
  const [owner, member, outsider, guest, stranger] = await Promise.all([
    createTestUser(admin, "owner", { full_name: "Olive Owner" }),
    createTestUser(admin, "member", { full_name: "Milo Member" }),
    createTestUser(admin, "outsider", { full_name: "Otto Outsider" }),
    createAnonymousTestUser(),
    createAnonymousTestUser(),
  ]);
  const workspaceId = await insertWorkspace(admin, owner.id, "Workspace A");
  await insertMember(admin, workspaceId, member.id, "member");
  await insertMember(admin, workspaceId, guest.id, "guest");
  const site = await insertSite(admin, workspaceId);
  const otherWorkspaceId = await insertWorkspace(admin, outsider.id, "Workspace B");
  const otherSite = await insertSite(admin, otherWorkspaceId);
  return {
    admin,
    owner,
    member,
    guest,
    outsider,
    stranger,
    workspaceId,
    site,
    otherWorkspaceId,
    otherSite,
    users: [owner, member, outsider, guest, stranger],
    storagePaths: [],
  };
}

export async function destroyScenario(scenario: Scenario): Promise<void> {
  if (scenario.storagePaths.length > 0) {
    await scenario.admin.storage.from("screenshots").remove(scenario.storagePaths);
  }
  await deleteTestUsers(scenario.admin, scenario.users);
}

export function expectRlsViolation(result: { error: ErrorLike | null }): void {
  expect(result.error?.code).toBe(PERMISSION_DENIED);
  expect(result.error?.message).toMatch(/row-level security/);
}

export function expectPermissionDenied(result: { error: ErrorLike | null }): void {
  expect(result.error?.code).toBe(PERMISSION_DENIED);
  expect(result.error?.message).toMatch(/permission denied/);
}

export function expectImmutable(result: { error: ErrorLike | null }): void {
  expect(result.error?.code).toBe(PERMISSION_DENIED);
  expect(result.error?.message).toMatch(/immutable/);
}

export function expectCheckViolation(result: { error: ErrorLike | null }, pattern: RegExp): void {
  expect(result.error?.code).toBe(CHECK_VIOLATION);
  expect(result.error?.message).toMatch(pattern);
}

export function expectCode(result: { error: ErrorLike | null }, code: string): void {
  expect(result.error?.code).toBe(code);
}

export function expectNoRows(result: {
  data: readonly unknown[] | null;
  error: ErrorLike | null;
}): void {
  expect(result.error).toBeNull();
  expect(result.data).toEqual([]);
}

export function expectOneRow(result: {
  data: readonly unknown[] | null;
  error: ErrorLike | null;
}): void {
  expect(result.error).toBeNull();
  expect(result.data).toHaveLength(1);
}
