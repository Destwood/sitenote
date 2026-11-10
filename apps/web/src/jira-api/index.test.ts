import type { SitenoteClient } from "@sitenote/db";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  JIRA_DISCONNECT_MESSAGE,
  JIRA_FAILURE_MESSAGE,
  disconnectJira,
  isJiraConfigured,
  linkJiraIssue,
  normalizeIssueKey,
  readJiraConnection,
  saveJiraSettings,
} from ".";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const THREAD_ID = "20000000-0000-4000-8000-000000000001";

function fakeClient(invoke: ReturnType<typeof vi.fn>, rpc: ReturnType<typeof vi.fn> = vi.fn()) {
  return { functions: { invoke }, rpc } as unknown as SitenoteClient;
}

function failure(status: number, body: string): FunctionsHttpError {
  return new FunctionsHttpError(new Response(body, { status }));
}

describe("normalizeIssueKey", () => {
  it("trims and uppercases a valid key", () => {
    expect(normalizeIssueKey("  proj-123 ")).toBe("PROJ-123");
    expect(normalizeIssueKey("AB_C2-7")).toBe("AB_C2-7");
  });

  it.each(["", "PROJ", "123-4", "P-", "PROJ-12a", "PROJ 12", "A-" + "1".repeat(63)])(
    "rejects %j",
    (input) => {
      expect(normalizeIssueKey(input)).toBeNull();
    },
  );

  it("rejects a key longer than 64 characters", () => {
    expect(normalizeIssueKey(`A${"B".repeat(63)}-1`)).toBeNull();
  });
});

describe("saveJiraSettings", () => {
  it("sends the site, the email and the token to the save function", async () => {
    const invoke = vi.fn<
      (name: string, options: { body: Record<string, unknown> }) => Promise<unknown>
    >(() => Promise.resolve({ data: { connected: true }, error: null }));
    const result = await saveJiraSettings(fakeClient(invoke), {
      workspaceId: WORKSPACE_ID,
      siteUrl: "https://acme.atlassian.net",
      email: "dev@example.com",
      token: "api-token",
    });
    expect(result).toEqual({ ok: true, data: null });
    expect(invoke).toHaveBeenCalledWith("jira-save-settings", {
      body: {
        workspaceId: WORKSPACE_ID,
        siteUrl: "https://acme.atlassian.net",
        email: "dev@example.com",
        token: "api-token",
      },
    });
  });

  it("shows the message the function returned for a rejected site", async () => {
    const invoke = vi.fn(() =>
      Promise.resolve({
        data: null,
        error: failure(
          400,
          JSON.stringify({
            error: {
              code: "validation",
              message: "Enter a valid https://your-site.atlassian.net address",
            },
          }),
        ),
      }),
    );
    expect(
      await saveJiraSettings(fakeClient(invoke), {
        workspaceId: WORKSPACE_ID,
        siteUrl: "http://acme.example",
        email: "dev@example.com",
      }),
    ).toEqual({
      ok: false,
      message: "Enter a valid https://your-site.atlassian.net address",
      code: "validation",
    });
  });

  it("falls back to a generic message when the failure has no readable body", async () => {
    const invoke = vi.fn(() => Promise.resolve({ data: null, error: failure(502, "<html>") }));
    expect(
      await saveJiraSettings(fakeClient(invoke), {
        workspaceId: WORKSPACE_ID,
        siteUrl: "https://acme.atlassian.net",
        email: "dev@example.com",
      }),
    ).toEqual({ ok: false, message: JIRA_FAILURE_MESSAGE });
  });
});

describe("disconnectJira", () => {
  it("removes the integration through the owner-only function", async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: null, error: null }));
    expect(await disconnectJira(fakeClient(vi.fn(), rpc), WORKSPACE_ID)).toEqual({
      ok: true,
      data: null,
    });
    expect(rpc).toHaveBeenCalledWith("jira_disconnect", { p_workspace_id: WORKSPACE_ID });
  });

  it("reports a failed disconnect", async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: null, error: { message: "denied" } }));
    expect(await disconnectJira(fakeClient(vi.fn(), rpc), WORKSPACE_ID)).toEqual({
      ok: false,
      message: JIRA_DISCONNECT_MESSAGE,
    });
  });
});

describe("linkJiraIssue", () => {
  it("returns the linked issue and whether the link was added", async () => {
    const invoke = vi.fn(() =>
      Promise.resolve({
        data: {
          issueKey: "PROJ-123",
          issueUrl: "https://acme.atlassian.net/browse/PROJ-123",
          linked: true,
          linkAdded: false,
        },
        error: null,
      }),
    );
    expect(await linkJiraIssue(fakeClient(invoke), THREAD_ID, "PROJ-123")).toEqual({
      ok: true,
      data: {
        issueKey: "PROJ-123",
        issueUrl: "https://acme.atlassian.net/browse/PROJ-123",
        linked: true,
        linkAdded: false,
      },
    });
    expect(invoke).toHaveBeenCalledWith("jira-link-issue", {
      body: { threadId: THREAD_ID, issueKey: "PROJ-123" },
    });
  });

  it("shows the reason when the issue cannot be found", async () => {
    const invoke = vi.fn(() =>
      Promise.resolve({
        data: null,
        error: failure(
          404,
          JSON.stringify({ error: { code: "not_found", message: "The Jira issue was not found" } }),
        ),
      }),
    );
    expect(await linkJiraIssue(fakeClient(invoke), THREAD_ID, "PROJ-999")).toEqual({
      ok: false,
      message: "The Jira issue was not found",
      code: "not_found",
    });
  });

  it("rejects a success response with an unexpected shape", async () => {
    const invoke = vi.fn(() => Promise.resolve({ data: { linked: true }, error: null }));
    expect(await linkJiraIssue(fakeClient(invoke), THREAD_ID, "PROJ-123")).toEqual({
      ok: false,
      message: JIRA_FAILURE_MESSAGE,
    });
  });
});

describe("isJiraConfigured", () => {
  it("is true only when the function answers true", async () => {
    const yes = vi.fn(() => Promise.resolve({ data: true, error: null }));
    expect(await isJiraConfigured(fakeClient(vi.fn(), yes), WORKSPACE_ID)).toBe(true);
    const no = vi.fn(() => Promise.resolve({ data: false, error: null }));
    expect(await isJiraConfigured(fakeClient(vi.fn(), no), WORKSPACE_ID)).toBe(false);
    const broken = vi.fn(() => Promise.resolve({ data: null, error: { message: "x" } }));
    expect(await isJiraConfigured(fakeClient(vi.fn(), broken), WORKSPACE_ID)).toBe(false);
  });
});

describe("readJiraConnection", () => {
  it("reads the site and the email and ignores anything else", () => {
    expect(
      readJiraConnection({
        siteUrl: "https://acme.atlassian.net",
        email: "dev@example.com",
        secretId: "secret",
      }),
    ).toEqual({ siteUrl: "https://acme.atlassian.net", email: "dev@example.com" });
  });

  it("returns null for empty or incomplete settings", () => {
    expect(readJiraConnection({})).toBeNull();
    expect(readJiraConnection({ siteUrl: "https://acme.atlassian.net" })).toBeNull();
    expect(readJiraConnection(null)).toBeNull();
  });
});
