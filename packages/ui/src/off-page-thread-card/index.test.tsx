import type { ThreadContext } from "@sitenote/core";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BOB, makeComment, makeThread } from "../test-fixtures";
import type { SiteThreadItem } from "../types";
import { OffPageThreadCard, type OffPageThreadCardProps } from ".";

const ITEM: SiteThreadItem = {
  id: "t2",
  number: 1,
  status: "open",
  authorName: "Ann Author",
  excerpt: "First",
  replies: 1,
  route: "/other",
  hasSteps: false,
};

function renderCard(props: Partial<OffPageThreadCardProps> = {}) {
  const handlers = {
    onReproduce: vi.fn(),
    onOpenPage: vi.fn(),
    onToggleStatus: vi.fn(),
    onCopyRoute: vi.fn(),
    onClose: vi.fn(),
  };
  render(<OffPageThreadCard item={ITEM} sidebarOpen={false} {...handlers} {...props} />);
  return handlers;
}

function twoComments() {
  return makeThread({
    id: "t2",
    comments: [
      makeComment({ id: "c1", body: "First", canEdit: false }),
      makeComment({ id: "c2", author: BOB, body: "Second", canEdit: false }),
    ],
    context: {
      viewport: { width: 1440, height: 900 },
      devicePixelRatio: 2,
      pageTitle: "Northwind",
      url: "https://example.test/other",
      browser: { name: "Chrome", version: "130" },
      os: { name: "Windows", version: "11" },
      userAgent: "ua",
      consoleErrors: [],
      capturedAt: "2026-10-22T09:30:00.000Z",
    },
  });
}

describe("OffPageThreadCard", () => {
  it("shows the excerpt when no thread is given", () => {
    renderCard();

    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Page context" })).toBeNull();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("shows every comment and the context of the thread", () => {
    renderCard({ thread: twoComments() });

    const items = screen.getAllByRole("listitem");

    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain("Ann Author");
    expect(items[0]?.textContent).toContain("First");
    expect(items[1]?.textContent).toContain("Bob Reviewer");
    expect(items[1]?.textContent).toContain("Second");
    const section = screen.getByRole("region", { name: "Page context" });
    expect(within(section).getByText("1440×900 @2x")).toBeTruthy();
  });

  it("offers no edit or delete actions on the comments", () => {
    renderCard({ thread: twoComments() });

    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("does not wait forever for a recording it cannot load", () => {
    const context: ThreadContext = {
      viewport: { width: 1440, height: 900 },
      devicePixelRatio: 2,
      pageTitle: "Northwind",
      url: "https://example.test/other",
      browser: { name: "Chrome", version: "130" },
      os: { name: "Windows", version: "11" },
      userAgent: "ua",
      consoleErrors: [],
      capturedAt: "2026-10-22T09:30:00.000Z",
      recording: { path: "ws/thread.webm", durationMs: 65_000, size: 1_572_864 },
    };
    renderCard({ thread: makeThread({ id: "t2", context }) });

    expect(screen.queryByText("Loading video...")).toBeNull();
    expect(screen.getByText("Video could not be loaded.")).toBeTruthy();
  });
});
