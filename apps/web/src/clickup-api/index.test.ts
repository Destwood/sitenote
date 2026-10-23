import type { SitenoteClient } from "@sitenote/db";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  CLICKUP_DISCONNECT_MESSAGE,
  CLICKUP_FAILURE_MESSAGE,
  createClickUpTask,
  disconnectClickUp,
  isClickUpConfigured,
  loadClickUpHierarchy,
  readClickUpConnection,
  saveClickUpSettings,
} from ".";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const THREAD_ID = "20000000-0000-4000-8000-000000000001";

function fakeClient(invoke: ReturnType<typeof vi.fn>, rpc: ReturnType<typeof vi.fn> = vi.fn()) {
  return { functions: { invoke }, rpc } as unknown as SitenoteClient;
}

function failure(status: number, body: string): FunctionsHttpError {
  return new FunctionsHttpError(new Response(body, { status }));
}

describe("loadClickUpHierarchy", () => {
  it("returns the teams and the optional spaces and lists", async () => {
    const invoke = vi.fn(() =>
      Promise.resolve({
        data: { teams: [{ id: "1", name: "Studio" }], spaces: [{ id: "2", name: "Web" }] },
        error: null,
      }),
    );
    const result = await loadClickUpHierarchy(fakeClient(invoke), {
      workspaceId: WORKSPACE_ID,
      teamId: "1",
    });
    expect(result).toEqual({
      ok: true,
      data: { teams: [{ id: "1", name: "Studio" }], spaces: [{ id: "2", name: "Web" }] },
    });
    expect(invoke).toHaveBeenCalledWith("clickup-hierarchy", {
      body: { workspaceId: WORKSPACE_ID, teamId: "1" },
    });
  });

  it("shows the message the function returned for a failed request", async () => {
    const invoke = vi.fn(() =>
      Promise.resolve({
        data: null,
        error: failure(
          400,
          JSON.stringify({ error: { code: "validation", message: "ClickUp rejected this token" } }),
        ),
      }),
    );
    expect(await loadClickUpHierarchy(fakeClient(invoke), { workspaceId: WORKSPACE_ID })).toEqual({
      ok: false,
      message: "ClickUp rejected this token",
      code: "validation",
    });
  });

  it("falls back to a generic message when the failure has no readable body", async () => {
    const invoke = vi.fn(() => Promise.resolve({ data: null, error: failure(502, "<html>") }));
    expect(await loadClickUpHierarchy(fakeClient(invoke), { workspaceId: WORKSPACE_ID })).toEqual({
      ok: false,
      message: CLICKUP_FAILURE_MESSAGE,
    });
  });

  it("rejects a success response with an unexpected shape", async () => {
    const invoke = vi.fn(() => Promise.resolve({ data: { spaces: [] }, error: null }));
    expect(await loadClickUpHierarchy(fakeClient(invoke), { workspaceId: WORKSPACE_ID })).toEqual({
      ok: false,
      message: CLICKUP_FAILURE_MESSAGE,
    });
  });
});

describe("saveClickUpSettings", () => {
  it("sends the token and the chosen list to the save function", async () => {
    const invoke = vi.fn<
      (name: string, options: { body: Record<string, unknown> }) => Promise<unknown>
    >(() => Promise.resolve({ data: { connected: true }, error: null }));
    const result = await saveClickUpSettings(fakeClient(invoke), {
      workspaceId: WORKSPACE_ID,
      token: "pk_1_token",
      teamId: "1",
      teamName: "Studio",
      spaceId: "2",
      spaceName: "Web",
      listId: "789",
      listName: "Bugs",
    });
    expect(result).toEqual({ ok: true, data: null });
    expect(invoke.mock.calls[0]?.[1].body).toMatchObject({ listId: "789", token: "pk_1_token" });
  });
});

describe("disconnectClickUp", () => {
  it("removes the integration through the owner-only function", async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: null, error: null }));
    expect(await disconnectClickUp(fakeClient(vi.fn(), rpc), WORKSPACE_ID)).toEqual({
      ok: true,
      data: null,
    });
    expect(rpc).toHaveBeenCalledWith("clickup_disconnect", { p_workspace_id: WORKSPACE_ID });
  });

  it("reports a failed disconnect", async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: null, error: { message: "denied" } }));
    expect(await disconnectClickUp(fakeClient(vi.fn(), rpc), WORKSPACE_ID)).toEqual({
      ok: false,
      message: CLICKUP_DISCONNECT_MESSAGE,
    });
  });
});

describe("createClickUpTask", () => {
  it("returns the task link and whether the screenshot was attached", async () => {
    const invoke = vi.fn(() =>
      Promise.resolve({
        data: {
          taskId: "86abc",
          taskUrl: "https://app.clickup.com/t/86abc",
          created: true,
          screenshotAttached: false,
        },
        error: null,
      }),
    );
    expect(await createClickUpTask(fakeClient(invoke), THREAD_ID)).toEqual({
      ok: true,
      data: {
        taskId: "86abc",
        taskUrl: "https://app.clickup.com/t/86abc",
        created: true,
        screenshotAttached: false,
      },
    });
    expect(invoke).toHaveBeenCalledWith("clickup-create-task", { body: { threadId: THREAD_ID } });
  });
});

describe("isClickUpConfigured", () => {
  it("is true only when the function answers true", async () => {
    const yes = vi.fn(() => Promise.resolve({ data: true, error: null }));
    expect(await isClickUpConfigured(fakeClient(vi.fn(), yes), WORKSPACE_ID)).toBe(true);
    const no = vi.fn(() => Promise.resolve({ data: false, error: null }));
    expect(await isClickUpConfigured(fakeClient(vi.fn(), no), WORKSPACE_ID)).toBe(false);
    const broken = vi.fn(() => Promise.resolve({ data: null, error: { message: "x" } }));
    expect(await isClickUpConfigured(fakeClient(vi.fn(), broken), WORKSPACE_ID)).toBe(false);
  });
});

describe("readClickUpConnection", () => {
  it("reads the names of the stored list and ignores the ids", () => {
    expect(
      readClickUpConnection({
        teamId: "1",
        teamName: "Studio",
        spaceId: "2",
        spaceName: "Web",
        listId: "789",
        listName: "Bugs",
      }),
    ).toEqual({ teamName: "Studio", spaceName: "Web", listName: "Bugs" });
  });

  it("returns null for empty or incomplete settings", () => {
    expect(readClickUpConnection({})).toBeNull();
    expect(readClickUpConnection(null)).toBeNull();
  });
});
