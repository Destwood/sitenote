import type { Anchor } from "@sitenote/core";
import { describe, expect, it } from "vitest";

import { ORPHANED, type Resolution } from "../anchor-target";
import type { CommentRecord, ThreadRecord } from "../transport";
import { SUMMARY_EXCERPT_LIMIT, summarizeThreads } from ".";

const ME = "00000000-0000-4000-8000-000000000002";
const THREAD_ID = "30000000-0000-4000-8000-000000000001";

const ANCHOR: Anchor = {
  kind: "element",
  selectors: { css: "main > button.cta", nthPath: "body > main:nth-of-type(1)" },
  fingerprint: { tag: "button", text: "Book", classes: [], width: 10, height: 10 },
  offset: { x: 0.5, y: 0.5 },
};

function comment(overrides: Partial<CommentRecord> = {}): CommentRecord {
  return {
    id: "50000000-0000-4000-8000-000000000001",
    threadId: THREAD_ID,
    author: { id: ME, displayName: "Me", avatarUrl: null },
    body: "Hello",
    createdAt: "2026-10-21T10:00:00.000Z",
    editedAt: null,
    deleted: false,
    mentions: [],
    ...overrides,
  };
}

function thread(overrides: Partial<ThreadRecord> = {}): ThreadRecord {
  return {
    id: THREAD_ID,
    siteId: "20000000-0000-4000-8000-000000000001",
    pageUrl: "https://example.test/",
    status: "open",
    anchor: ANCHOR,
    author: { id: ME, displayName: "Max Member", avatarUrl: null },
    createdAt: "2026-10-21T10:00:00.000Z",
    context: null,
    hasScreenshot: false,
    comments: [comment()],
    ...overrides,
  };
}

const RESOLVED: Resolution = {
  status: "resolved",
  target: { kind: "text", range: document.createRange() },
};

describe("summarizeThreads", () => {
  it("numbers threads by creation time, as the pins are numbered", () => {
    const late = thread({
      id: "30000000-0000-4000-8000-000000000002",
      createdAt: "2026-10-21T12:00:00.000Z",
    });
    const early = thread();

    const summaries = summarizeThreads([late, early], new Map([[early.id, RESOLVED]]));

    expect(summaries.map((summary) => [summary.id, summary.number])).toEqual([
      [early.id, 1],
      [late.id, 2],
    ]);
  });

  it("describes the thread with its status, author and reply count", () => {
    const withReplies = thread({
      status: "resolved",
      comments: [
        comment(),
        comment({ id: "50000000-0000-4000-8000-000000000002" }),
        comment({ id: "50000000-0000-4000-8000-000000000003" }),
      ],
    });

    expect(summarizeThreads([withReplies], new Map([[THREAD_ID, RESOLVED]]))).toEqual([
      {
        id: THREAD_ID,
        number: 1,
        status: "resolved",
        excerpt: "Hello",
        authorName: "Max Member",
        replies: 2,
        detached: false,
      },
    ]);
  });

  it("uses the first comment that is not deleted as the excerpt", () => {
    const summary = summarizeThreads(
      [
        thread({
          comments: [
            comment({ body: "Gone", deleted: true }),
            comment({
              id: "50000000-0000-4000-8000-000000000002",
              body: "  Make   this\n\nshorter  ",
            }),
          ],
        }),
      ],
      new Map(),
    );

    expect(summary[0]?.excerpt).toBe("Make this shorter");
    expect(summary[0]?.replies).toBe(0);
  });

  it("cuts a long excerpt to the limit with an ellipsis", () => {
    const body = "x".repeat(SUMMARY_EXCERPT_LIMIT + 10);

    const [summary] = summarizeThreads([thread({ comments: [comment({ body })] })], new Map());

    expect(summary?.excerpt).toBe(`${"x".repeat(SUMMARY_EXCERPT_LIMIT)}…`);
  });

  it("keeps a short excerpt whole and an empty one empty", () => {
    const short = summarizeThreads([thread({ comments: [comment({ body: "Short" })] })], new Map());
    const empty = summarizeThreads(
      [thread({ comments: [comment({ body: "Gone", deleted: true })] })],
      new Map(),
    );

    expect(short[0]?.excerpt).toBe("Short");
    expect(empty[0]?.excerpt).toBe("");
    expect(empty[0]?.replies).toBe(0);
  });

  it("marks a thread whose element is gone as detached and keeps resolved ones attached", () => {
    const gone = thread();
    const kept = thread({ id: "30000000-0000-4000-8000-000000000002" });
    const resolutions = new Map<string, Resolution>([
      [gone.id, ORPHANED],
      [kept.id, RESOLVED],
    ]);

    const summaries = summarizeThreads([gone, kept], resolutions);

    expect(summaries.map((summary) => [summary.id, summary.detached])).toEqual([
      [gone.id, true],
      [kept.id, false],
    ]);
  });
});
