import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  buildThread,
  createScenario,
  destroyScenario,
  insertThread,
  readTestEnv,
  withDb,
  type Scenario,
} from "../test-harness";

const TABLES = [
  "comments",
  "integrations",
  "invites",
  "members",
  "notifications",
  "profiles",
  "sites",
  "threads",
  "workspaces",
];

const AUTHENTICATED_COLUMN_PRIVILEGES: Record<string, Record<string, string[]>> = {
  comments: {
    INSERT: ["author_id", "body", "mentions", "thread_id", "workspace_id"],
    SELECT: [
      "author_id",
      "body",
      "created_at",
      "deleted_at",
      "edited_at",
      "id",
      "mentions",
      "thread_id",
      "updated_at",
      "workspace_id",
    ],
    UPDATE: ["body", "deleted_at", "mentions"],
  },
  integrations: {
    INSERT: ["provider", "settings", "workspace_id"],
    SELECT: ["created_at", "id", "provider", "settings", "updated_at", "workspace_id"],
    UPDATE: ["settings"],
  },
  invites: {
    INSERT: ["created_by", "expires_at", "role", "workspace_id"],
    SELECT: [
      "created_at",
      "created_by",
      "expires_at",
      "id",
      "revoked_at",
      "role",
      "token",
      "updated_at",
      "workspace_id",
    ],
    UPDATE: ["revoked_at"],
  },
  members: {
    INSERT: ["role", "user_id", "workspace_id"],
    SELECT: ["created_at", "id", "role", "updated_at", "user_id", "workspace_id"],
    UPDATE: ["role"],
  },
  notifications: {
    SELECT: [
      "comment_id",
      "created_at",
      "id",
      "kind",
      "read_at",
      "thread_id",
      "updated_at",
      "user_id",
      "workspace_id",
    ],
    UPDATE: ["read_at"],
  },
  profiles: {
    SELECT: ["avatar_url", "created_at", "display_name", "updated_at", "user_id"],
    UPDATE: ["avatar_url", "display_name"],
  },
  sites: {
    INSERT: ["origin", "workspace_id"],
    SELECT: ["created_at", "id", "origin", "updated_at", "workspace_id"],
    UPDATE: ["origin"],
  },
  threads: {
    INSERT: [
      "anchor",
      "context",
      "created_by",
      "id",
      "page_url",
      "screenshot_path",
      "site_id",
      "status",
      "workspace_id",
    ],
    SELECT: [
      "anchor",
      "clickup_task_id",
      "clickup_task_url",
      "context",
      "created_at",
      "created_by",
      "id",
      "page_url",
      "resolved_at",
      "resolved_by",
      "screenshot_path",
      "site_id",
      "status",
      "updated_at",
      "workspace_id",
    ],
    UPDATE: ["status"],
  },
  workspaces: {
    INSERT: ["name", "owner_id"],
    SELECT: ["created_at", "id", "name", "owner_id", "updated_at"],
    UPDATE: ["name"],
  },
};

const AUTHENTICATED_DELETE = [
  "integrations",
  "invites",
  "members",
  "notifications",
  "sites",
  "threads",
  "workspaces",
];

const POLICY_FUNCTIONS = [
  "is_anonymous",
  "is_workspace_member",
  "screenshot_workspace",
  "shares_workspace",
  "workspace_role",
];

let scenario: Scenario;

beforeAll(async () => {
  scenario = await createScenario();
});

afterAll(async () => {
  await destroyScenario(scenario);
});

interface Outcome {
  code: string | null;
  rowCount: number | null;
}

async function attemptAs(options: {
  userId: string;
  isAnonymous?: boolean;
  disabledTriggers?: { table: string; trigger: string }[];
  sql: string;
  values?: unknown[];
}): Promise<Outcome> {
  return withDb(async (db) => {
    await db.query("begin");
    try {
      await db.query("set local lock_timeout = '10s'");
      for (const { table, trigger } of options.disabledTriggers ?? []) {
        await db.query(`alter table public.${table} disable trigger ${trigger}`);
      }
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({
          sub: options.userId,
          role: "authenticated",
          is_anonymous: options.isAnonymous ?? false,
        }),
      ]);
      await db.query("set local role authenticated");
      const result = await db.query(options.sql, options.values);
      return { code: null, rowCount: result.rowCount };
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : "unknown";
      return { code, rowCount: null };
    } finally {
      await db.query("rollback");
    }
  });
}

describe("table security posture", () => {
  it("covers exactly the expected tables", async () => {
    const rows = await withDb((db) =>
      db.query<{ relname: string }>(
        `select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f') order by 1`,
      ),
    );
    expect(rows.rows.map((row) => row.relname)).toEqual(TABLES);
  });

  it("enables and forces row level security with at least one policy on every table", async () => {
    const rows = await withDb((db) =>
      db.query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
        policies: string;
      }>(
        `select c.relname, c.relrowsecurity, c.relforcerowsecurity,
                (select count(*) from pg_policy p where p.polrelid = c.oid)::text as policies
         from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1`,
      ),
    );
    expect(rows.rows).toHaveLength(TABLES.length);
    for (const row of rows.rows) {
      expect(row.relrowsecurity, row.relname).toBe(true);
      expect(row.relforcerowsecurity, row.relname).toBe(true);
      expect(Number(row.policies), row.relname).toBeGreaterThan(0);
    }
  });

  it("gives the anon role no privilege on any table or column", async () => {
    const rows = await withDb((db) =>
      db.query(
        `select 'table' as scope, table_name, privilege_type from information_schema.role_table_grants
           where grantee = 'anon' and table_schema = 'public'
         union all
         select 'column', table_name || '.' || column_name, privilege_type from information_schema.column_privileges
           where grantee = 'anon' and table_schema = 'public'`,
      ),
    );
    expect(rows.rows).toEqual([]);
  });

  it("limits the authenticated role to the documented column privileges", async () => {
    const rows = await withDb((db) =>
      db.query<{ table_name: string; privilege_type: string; columns: string[] }>(
        `select table_name, privilege_type, array_agg(column_name::text order by column_name) as columns
         from information_schema.column_privileges
         where grantee = 'authenticated' and table_schema = 'public'
         group by table_name, privilege_type`,
      ),
    );
    const actual: Record<string, Record<string, string[]>> = {};
    for (const row of rows.rows) {
      actual[row.table_name] = { ...actual[row.table_name], [row.privilege_type]: row.columns };
    }
    expect(actual).toEqual(AUTHENTICATED_COLUMN_PRIVILEGES);
  });

  it("limits table level privileges of the authenticated role to delete where documented", async () => {
    const rows = await withDb((db) =>
      db.query<{ table_name: string; privilege_type: string }>(
        `select table_name, privilege_type from information_schema.role_table_grants
         where grantee = 'authenticated' and table_schema = 'public'
           and privilege_type in ('DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES')
         order by 1, 2`,
      ),
    );
    expect(rows.rows.map((row) => `${row.table_name}:${row.privilege_type}`)).toEqual(
      AUTHENTICATED_DELETE.map((table) => `${table}:DELETE`),
    );
  });

  it("never lets a client select integrations.secret_id or profiles.email", async () => {
    const rows = await withDb((db) =>
      db.query<{ secret: boolean; email: boolean; anon_secret: boolean }>(
        `select has_column_privilege('authenticated', 'public.integrations', 'secret_id', 'SELECT') as secret,
                has_column_privilege('authenticated', 'public.profiles', 'email', 'SELECT') as email,
                has_column_privilege('anon', 'public.integrations', 'secret_id', 'SELECT') as anon_secret`,
      ),
    );
    expect(rows.rows[0]).toEqual({ secret: false, email: false, anon_secret: false });
  });
});

describe("functions and schemas", () => {
  it("defines only the documented functions in the public schema, each with a pinned search path", async () => {
    const rows = await withDb((db) =>
      db.query<{
        proname: string;
        prosecdef: boolean;
        proconfig: string[] | null;
        anon: boolean;
        authenticated: boolean;
        public_exec: boolean;
      }>(
        `select p.proname, p.prosecdef, p.proconfig,
                has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
                has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
                exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0) as public_exec
         from pg_proc p
         where p.pronamespace = 'public'::regnamespace
           and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
         order by 1`,
      ),
    );
    const pinned = ['search_path=""'];
    expect(rows.rows).toEqual([
      {
        proname: "accept_invite",
        prosecdef: true,
        proconfig: pinned,
        anon: false,
        authenticated: true,
        public_exec: false,
      },
      {
        proname: "create_invite",
        prosecdef: false,
        proconfig: pinned,
        anon: false,
        authenticated: true,
        public_exec: false,
      },
      {
        proname: "create_thread",
        prosecdef: false,
        proconfig: pinned,
        anon: false,
        authenticated: true,
        public_exec: false,
      },
      {
        proname: "invite_preview",
        prosecdef: true,
        proconfig: pinned,
        anon: true,
        authenticated: true,
        public_exec: false,
      },
    ]);
  });

  it("keeps helper functions out of reach of anon and out of the authenticated schema search", async () => {
    const rows = await withDb((db) =>
      db.query<{
        proname: string;
        anon: boolean;
        authenticated: boolean;
        public_exec: boolean;
      }>(
        `select p.proname,
                has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
                has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
                exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0) as public_exec
         from pg_proc p where p.pronamespace = 'private'::regnamespace order by 1`,
      ),
    );
    expect(rows.rows.length).toBeGreaterThan(POLICY_FUNCTIONS.length);
    for (const row of rows.rows) {
      expect(row.anon, row.proname).toBe(false);
      expect(row.public_exec, row.proname).toBe(false);
      expect(row.authenticated, row.proname).toBe(POLICY_FUNCTIONS.includes(row.proname));
    }
    const schema = await withDb((db) =>
      db.query<{ anon: boolean; authenticated: boolean }>(
        `select has_schema_privilege('anon', 'private', 'USAGE') as anon,
                has_schema_privilege('authenticated', 'private', 'USAGE') as authenticated`,
      ),
    );
    expect(schema.rows[0]).toEqual({ anon: false, authenticated: false });
  });

  it("pins search_path on every function in the private schema", async () => {
    const rows = await withDb((db) =>
      db.query<{ proname: string; proconfig: string[] | null }>(
        `select proname, proconfig from pg_proc where pronamespace = 'private'::regnamespace`,
      ),
    );
    for (const row of rows.rows) {
      expect(row.proconfig, row.proname).toEqual(['search_path=""']);
    }
  });

  it("is not exposed through the data api", async () => {
    const env = readTestEnv();
    const headers = { apikey: env.publishableKey, "accept-profile": "private" };
    const profile = await fetch(`${env.url}/rest/v1/members?select=id`, { headers });
    expect(profile.status).toBe(406);
    const rpc = await fetch(`${env.url}/rest/v1/rpc/workspace_role`, {
      method: "POST",
      headers: { apikey: env.publishableKey, "content-type": "application/json" },
      body: JSON.stringify({ ws: scenario.workspaceId }),
    });
    expect(rpc.status).toBe(404);
  });
});

describe("realtime publication", () => {
  it("publishes threads, comments and notifications only", async () => {
    const rows = await withDb((db) =>
      db.query<{ tablename: string }>(
        `select tablename from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' order by 1`,
      ),
    );
    expect(rows.rows.map((row) => row.tablename)).toEqual(["comments", "notifications", "threads"]);
  });
});

describe("policies hold on their own", () => {
  const OWNER_GUARD = [{ table: "members", trigger: "guard_owner" }];

  it("denies inserting an owner row even with the owner guard trigger disabled", async () => {
    const outcome = await attemptAs({
      userId: scenario.owner.id,
      disabledTriggers: OWNER_GUARD,
      sql: "insert into public.members (workspace_id, user_id, role) values ($1, $2, 'owner')",
      values: [scenario.workspaceId, scenario.outsider.id],
    });
    expect(outcome).toEqual({ code: "42501", rowCount: null });
  });

  it("denies promoting a member to owner even with the owner guard trigger disabled", async () => {
    const outcome = await attemptAs({
      userId: scenario.owner.id,
      disabledTriggers: OWNER_GUARD,
      sql: "update public.members set role = 'owner' where workspace_id = $1 and user_id = $2",
      values: [scenario.workspaceId, scenario.member.id],
    });
    expect(outcome).toEqual({ code: "42501", rowCount: null });
  });

  it("does not let a member promote themselves even with the owner guard trigger disabled", async () => {
    const outcome = await attemptAs({
      userId: scenario.member.id,
      disabledTriggers: OWNER_GUARD,
      sql: "update public.members set role = 'owner' where workspace_id = $1 and user_id = $2",
      values: [scenario.workspaceId, scenario.member.id],
    });
    expect(outcome).toEqual({ code: null, rowCount: 0 });
  });

  it("does not demote or delete the owner row even with the owner guard trigger disabled", async () => {
    const demote = await attemptAs({
      userId: scenario.owner.id,
      disabledTriggers: OWNER_GUARD,
      sql: "update public.members set role = 'member' where workspace_id = $1 and user_id = $2",
      values: [scenario.workspaceId, scenario.owner.id],
    });
    expect(demote).toEqual({ code: null, rowCount: 0 });
    const remove = await attemptAs({
      userId: scenario.owner.id,
      disabledTriggers: OWNER_GUARD,
      sql: "delete from public.members where workspace_id = $1 and user_id = $2",
      values: [scenario.workspaceId, scenario.owner.id],
    });
    expect(remove).toEqual({ code: null, rowCount: 0 });
  });

  it("denies a thread whose site belongs to another workspace even with the insert trigger disabled", async () => {
    const thread = buildThread(scenario.otherSite, scenario.member.id, {
      workspace_id: scenario.workspaceId,
    });
    const outcome = await attemptAs({
      userId: scenario.member.id,
      disabledTriggers: [{ table: "threads", trigger: "prepare_insert" }],
      sql: `insert into public.threads (id, workspace_id, site_id, page_url, anchor, created_by)
            values ($1, $2, $3, $4, $5, $6)`,
      values: [
        thread.id,
        scenario.workspaceId,
        scenario.otherSite.id,
        thread.page_url,
        JSON.stringify(thread.anchor),
        scenario.member.id,
      ],
    });
    expect(outcome).toEqual({ code: "42501", rowCount: null });
  });

  it("denies a comment on a thread of another workspace even with the insert trigger disabled", async () => {
    const foreign = await insertThread(scenario.admin, scenario.otherSite, scenario.outsider.id);
    const outcome = await attemptAs({
      userId: scenario.member.id,
      disabledTriggers: [{ table: "comments", trigger: "prepare_insert" }],
      sql: `insert into public.comments (thread_id, workspace_id, author_id, body)
            values ($1, $2, $3, 'cross-workspace')`,
      values: [foreign.id, scenario.workspaceId, scenario.member.id],
    });
    expect(outcome).toEqual({ code: "42501", rowCount: null });
  });

  it("accepts the same statements when they are legitimate", async () => {
    const thread = await insertThread(scenario.admin, scenario.site, scenario.owner.id);
    const own = await attemptAs({
      userId: scenario.member.id,
      sql: `insert into public.comments (thread_id, workspace_id, author_id, body)
            values ($1, $2, $3, 'fine')`,
      values: [thread.id, scenario.workspaceId, scenario.member.id],
    });
    expect(own).toEqual({ code: null, rowCount: 1 });
    const probe = await attemptAs({
      userId: randomUUID(),
      sql: "select 1 from public.members where workspace_id = $1",
      values: [scenario.workspaceId],
    });
    expect(probe).toEqual({ code: null, rowCount: 0 });
  });
});
