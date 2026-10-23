import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  searchThreads: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("../../../../../supabase-server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ from: mocks.from }),
}));
vi.mock("../../../../../thread-search", () => ({ searchThreads: mocks.searchThreads }));

import ThreadsPage from "./page";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const THREAD_ID = "20000000-0000-4000-8000-000000000001";
const SITE_ID = "30000000-0000-4000-8000-000000000001";

const MEMBER_ROWS = [
  {
    user_id: "u-1",
    role: "owner",
    created_at: "2026-10-01T09:00:00Z",
    profiles: { display_name: "Olena Owner" },
  },
];

async function renderPage(
  searchParams: Record<string, string | undefined> = {},
  workspaceId = WORKSPACE_ID,
) {
  render(
    await ThreadsPage({
      params: Promise.resolve({ workspaceId }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation((table: string) => ({
    select: () => ({
      eq: () => ({
        order: () =>
          Promise.resolve(
            table === "members"
              ? { data: MEMBER_ROWS, error: null }
              : { data: [{ id: SITE_ID, origin: "https://example.test" }], error: null },
          ),
      }),
    }),
  }));
  mocks.searchThreads.mockResolvedValue({
    rows: [
      {
        id: THREAD_ID,
        pageUrl: "https://example.test/pricing",
        status: "open",
        createdBy: "u-1",
        createdAt: "2026-10-22T09:00:00Z",
        commentCount: 1,
        lastActivity: "2026-10-22T09:00:00Z",
        firstBody: "Headline is cut off",
      },
    ],
    total: 30,
  });
});

describe("ThreadsPage", () => {
  it("answers 404 for a malformed workspace id", async () => {
    await expect(renderPage({}, "nope")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.searchThreads).not.toHaveBeenCalled();
  });

  it("shows the threads with the filters and the pager", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { name: "Threads" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "https://example.test" })).toBeTruthy();
    expect(screen.getByText("Headline is cut off")).toBeTruthy();
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Next" }).getAttribute("href")).toBe(
      `/app/w/${WORKSPACE_ID}/threads?pg=2`,
    );
  });

  it("searches with the open status and the first page by default", async () => {
    await renderPage();

    expect(mocks.searchThreads).toHaveBeenCalledWith(
      expect.anything(),
      WORKSPACE_ID,
      {
        site: null,
        page: "",
        status: "open",
        author: null,
        query: "",
      },
      1,
    );
  });

  it("passes the search and the page from the address", async () => {
    await renderPage({ q: "contrast", status: "all", pg: "2" });

    expect(mocks.searchThreads).toHaveBeenCalledWith(
      expect.anything(),
      WORKSPACE_ID,
      expect.objectContaining({ query: "contrast", status: "all" }),
      2,
    );
    expect(screen.getByRole("link", { name: "Previous" }).getAttribute("href")).toBe(
      `/app/w/${WORKSPACE_ID}/threads?status=all&q=contrast`,
    );
  });

  it("shows the no-match state when a filter removes every thread", async () => {
    mocks.searchThreads.mockResolvedValue({ rows: [], total: 0 });

    await renderPage({ q: "nothing" });

    expect(screen.getByText("No threads match these filters.")).toBeTruthy();
  });
});
