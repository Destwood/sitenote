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
vi.mock("../../../clickup-task-panel", () => ({ ClickUpTaskPanel: () => null }));
vi.mock("../../../supabase-server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      from: mocks.from,
      rpc: mocks.rpc,
      storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl }) },
    }),
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));
vi.mock("../../../env", () => ({
  getPublicEnv: () => ({ extensionId: "abcdefghijklmnopabcdefghijklmnop" }),
}));

import ThreadLinkPage from "./page";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const THREAD_ID = "20000000-0000-4000-8000-000000000001";
const USER = { id: "u-1", email: "max@sitenote.test", isAnonymous: false };

const THREAD = {
  id: THREAD_ID,
  workspace_id: WORKSPACE_ID,
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
    body: "Check the price",
    mentions: [],
    created_at: "2026-10-22T09:00:00Z",
    edited_at: null,
    deleted_at: null,
  },
];

const MEMBERS = [
  {
    user_id: "u-1",
    role: "member",
    created_at: "2026-10-01T09:00:00Z",
    profiles: { display_name: "Olena" },
  },
];

interface Results {
  thread: { data: unknown; error: unknown };
  access: { data: unknown; error: unknown };
}

function useTables({ thread, access }: Results) {
  const chain = (table: string) => {
    const link: Record<string, unknown> = {
      eq: () => link,
      order: () =>
        Promise.resolve(
          table === "comments" ? { data: COMMENTS, error: null } : { data: MEMBERS, error: null },
        ),
      maybeSingle: () => Promise.resolve(table === "threads" ? thread : access),
    };
    return link;
  };
  mocks.from.mockImplementation((table: string) => ({ select: () => chain(table) }));
}

const ACCESS = { data: { role: "member", workspaces: { name: "Northwind" } }, error: null };

async function renderPage(threadId = THREAD_ID) {
  render(await ThreadLinkPage({ params: Promise.resolve({ threadId }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthenticatedUser.mockResolvedValue(USER);
  mocks.createSignedUrl.mockResolvedValue({
    data: { signedUrl: "https://storage.example.test/rec.webm" },
    error: null,
  });
  useTables({ thread: { data: THREAD, error: null }, access: ACCESS });
});

describe("access", () => {
  it("answers 404 for a malformed thread id", async () => {
    await expect(renderPage("nope")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("sends a visitor without a session to sign in and back to the thread", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow(
      `NEXT_REDIRECT /sign-in?next=${encodeURIComponent(`/t/${THREAD_ID}`)}`,
    );
  });

  it("answers 404 when the thread is not readable", async () => {
    useTables({ thread: { data: null, error: null }, access: ACCESS });

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("answers 404 when the visitor is not a member of the thread workspace", async () => {
    useTables({ thread: { data: THREAD, error: null }, access: { data: null, error: null } });

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("fails loudly when the thread cannot be read", async () => {
    useTables({ thread: { data: null, error: { message: "down" } }, access: ACCESS });

    await expect(renderPage()).rejects.toThrow("Could not read the thread.");
  });
});

describe("thread link", () => {
  it("shows the workspace, the page, the status, the comments and the dashboard link", async () => {
    await renderPage();

    expect(screen.getByText("Northwind")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Thread on /pricing" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "https://example.test/pricing" }).getAttribute("href"),
    ).toBe("https://example.test/pricing");
    expect(screen.getByText("Open", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText("Check the price")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open in dashboard" }).getAttribute("href")).toBe(
      `/app/w/${WORKSPACE_ID}/threads/${THREAD_ID}`,
    );
  });

  it("plays the signed recording named by the thread context", async () => {
    useTables({
      thread: {
        data: {
          ...THREAD,
          context: {
            viewport: { width: 1440, height: 900 },
            devicePixelRatio: 2,
            pageTitle: "Pricing",
            url: "https://example.test/pricing",
            browser: { name: "Chrome", version: "130" },
            os: { name: "Windows", version: "11" },
            userAgent: "ua",
            consoleErrors: [],
            capturedAt: "2026-10-22T09:00:00.000Z",
            recording: { path: "ws/thread.webm", durationMs: 9_000, size: 2048 },
          },
        },
        error: null,
      },
      access: ACCESS,
    });

    await renderPage();

    expect(mocks.createSignedUrl).toHaveBeenCalledWith("ws/thread.webm", 3600);
    expect(screen.getByLabelText("Screen recording").getAttribute("src")).toBe(
      "https://storage.example.test/rec.webm",
    );
  });

  it("lists the reporter's steps with a copy button", async () => {
    useTables({
      thread: {
        data: {
          ...THREAD,
          context: {
            viewport: { width: 1440, height: 900 },
            devicePixelRatio: 2,
            pageTitle: "Pricing",
            url: "https://example.test/pricing",
            browser: { name: "Chrome", version: "130" },
            os: { name: "Windows", version: "11" },
            userAgent: "ua",
            consoleErrors: [],
            capturedAt: "2026-10-22T09:00:00.000Z",
            recording: {
              path: "ws/thread.webm",
              durationMs: 9_000,
              size: 2048,
              steps: [{ t: 2_000, kind: "click", selector: "#buy", label: "Buy now" }],
            },
          },
        },
        error: null,
      },
      access: ACCESS,
    });

    await renderPage();

    expect(screen.getByRole("list", { name: "What the reporter did (1)" })).toBeTruthy();
    expect(screen.getByText("Buy now")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy as Playwright" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Replay on page" })).toBeNull();
  });

  it("offers the install steps and a plain page link when the extension is not in the browser", async () => {
    await renderPage();

    expect(
      await screen.findByRole("heading", { name: "Install the Sitenote extension" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open page" }).getAttribute("href")).toBe(
      "https://example.test/pricing",
    );
  });

  it("offers no page link for an address that is not http or https", async () => {
    useTables({
      thread: { data: { ...THREAD, page_url: "javascript:alert(1)" }, error: null },
      access: ACCESS,
    });

    await renderPage();

    expect(screen.queryByRole("link", { name: "Open page" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Install the Sitenote extension" })).toBeNull();
    expect(screen.getByText("javascript:alert(1)")).toBeTruthy();
  });

  it("shows when a resolved thread was resolved", async () => {
    useTables({
      thread: {
        data: { ...THREAD, status: "resolved", resolved_at: "2026-10-22T11:00:00Z" },
        error: null,
      },
      access: ACCESS,
    });

    await renderPage();

    expect(screen.getByText("Resolved", { selector: "dt" })).toBeTruthy();
    expect(screen.getByText("22 Oct 2026, 11:00 UTC")).toBeTruthy();
  });
});
