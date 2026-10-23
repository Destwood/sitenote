import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(() => Promise.resolve({ data: false, error: null })),
  createSignedUrl: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("../../../../../../clickup-task-panel", () => ({ ClickUpTaskPanel: () => null }));
vi.mock("../../../../../../supabase-server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      from: mocks.from,
      rpc: mocks.rpc,
      storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl }) },
    }),
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));
vi.mock("../../../../../../env", () => ({
  getPublicEnv: () => ({ webUrl: "https://app.sitenote.test" }),
}));
vi.mock("../../../../../../thread-actions", () => ({ setThreadStatus: vi.fn() }));

import ThreadPage from "./page";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const THREAD_ID = "20000000-0000-4000-8000-000000000001";
const USER = { id: "u-1", email: "owner@sitenote.test", isAnonymous: false };

const THREAD = {
  workspace_id: WORKSPACE_ID,
  id: THREAD_ID,
  page_url: "https://example.test/pricing",
  status: "open",
  created_at: "2026-10-22T09:00:00Z",
  created_by: "u-1",
  resolved_at: null,
  screenshot_path: null,
  context: {},
};

const COMMENTS = [
  {
    id: "c-1",
    author_id: "u-1",
    body: "Hello @Max",
    mentions: ["u-2"],
    created_at: "2026-10-22T09:00:00Z",
    edited_at: null,
    deleted_at: null,
  },
];

const MEMBERS = [
  {
    user_id: "u-1",
    role: "owner",
    created_at: "2026-10-01T09:00:00Z",
    profiles: { display_name: "Olena" },
  },
  {
    user_id: "u-2",
    role: "member",
    created_at: "2026-10-02T09:00:00Z",
    profiles: { display_name: "Max" },
  },
];

function resolving(result: unknown) {
  const chain: Record<string, unknown> = {
    eq: () => chain,
    order: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
  };
  return chain;
}

function useTables(thread: { data: unknown; error: unknown }) {
  mocks.from.mockImplementation((table: string) => ({
    select: () =>
      resolving(
        table === "threads"
          ? thread
          : table === "comments"
            ? { data: COMMENTS, error: null }
            : { data: MEMBERS, error: null },
      ),
  }));
}

async function renderPage(threadId = THREAD_ID, workspaceId = WORKSPACE_ID) {
  render(
    await ThreadPage({
      params: Promise.resolve({ workspaceId, threadId }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthenticatedUser.mockResolvedValue(USER);
  mocks.createSignedUrl.mockResolvedValue({
    data: { signedUrl: "https://storage.example.test/shot.webp" },
    error: null,
  });
  useTables({ data: THREAD, error: null });
});

describe("access", () => {
  it("answers 404 for a malformed thread id", async () => {
    await expect(renderPage("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("answers 404 when the thread is not in this workspace", async () => {
    useTables({ data: null, error: null });

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("fails loudly when the thread cannot be read", async () => {
    useTables({ data: null, error: { message: "down" } });

    await expect(renderPage()).rejects.toThrow("Could not read the thread.");
  });
});

describe("thread", () => {
  it("shows the page, the status, the author and the comments with mentions", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { name: "Thread on /pricing" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "https://example.test/pricing" }).getAttribute("href"),
    ).toBe("https://example.test/pricing");
    expect(screen.getByText("Open")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resolve thread" })).toBeTruthy();
    expect(screen.getByText("Olena")).toBeTruthy();
    expect(screen.getByText("@Max").getAttribute("data-mention")).toBe("u-2");
  });

  it("offers the thread link and the signed screenshot", async () => {
    useTables({ data: { ...THREAD, screenshot_path: "a/b.webp" }, error: null });

    await renderPage();

    expect(screen.getByLabelText<HTMLInputElement>("Thread link").value).toBe(
      `https://app.sitenote.test/t/${THREAD_ID}`,
    );
    expect(mocks.createSignedUrl).toHaveBeenCalledWith("a/b.webp", 3600);
    expect(
      screen
        .getByRole("link", { name: "Open the full screenshot in a new tab" })
        .getAttribute("href"),
    ).toBe("https://storage.example.test/shot.webp");
  });

  it("does not link a page address that is not http or https", async () => {
    useTables({ data: { ...THREAD, page_url: "javascript:alert(1)" }, error: null });

    await renderPage();

    expect(screen.queryByRole("link", { name: "javascript:alert(1)" })).toBeNull();
    expect(screen.getByText("javascript:alert(1)")).toBeTruthy();
  });

  it("offers to reopen a resolved thread and shows when it was resolved", async () => {
    useTables({
      data: { ...THREAD, status: "resolved", resolved_at: "2026-10-22T11:00:00Z" },
      error: null,
    });

    await renderPage();

    expect(screen.getByRole("button", { name: "Reopen thread" })).toBeTruthy();
    expect(screen.getByText("Resolved", { selector: "dt" })).toBeTruthy();
    expect(screen.getByText("22 Oct 2026, 11:00 UTC")).toBeTruthy();
  });
});
