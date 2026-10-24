import { describe, expect, it } from "vitest";

import {
  FORMER_MEMBER_NAME,
  toComment,
  toMember,
  toThread,
  type CommentRow,
  type ThreadRow,
} from ".";

const ANCHOR = {
  kind: "element",
  selectors: {
    testId: "demo-hero-title",
    css: '[data-testid="demo-hero-title"]',
    nthPath: "main > h1",
  },
  fingerprint: { tag: "h1", text: "Comments", classes: [], width: 640, height: 56 },
  offset: { x: 0.5, y: 0.5 },
};

const AUTHOR = {
  user_id: "00000000-0000-4000-8000-000000000001",
  display_name: "Dana",
  avatar_url: null,
};

function commentRow(overrides: Partial<CommentRow> = {}): CommentRow {
  return {
    id: "00000000-0000-4000-8000-0000000000c1",
    thread_id: "00000000-0000-4000-8000-0000000000a1",
    author_id: AUTHOR.user_id,
    body: "Looks right",
    mentions: [],
    edited_at: null,
    deleted_at: null,
    created_at: "2026-10-24T10:00:00.000Z",
    author: AUTHOR,
    ...overrides,
  };
}

function threadRow(overrides: Partial<ThreadRow> = {}): ThreadRow {
  return {
    id: "00000000-0000-4000-8000-0000000000a1",
    site_id: "00000000-0000-4000-8000-0000000000b1",
    page_url: "http://localhost:3000/demo",
    anchor: ANCHOR,
    status: "open",
    context: {},
    screenshot_path: null,
    clickup_task_url: null,
    created_at: "2026-10-24T09:00:00.000Z",
    created_by: AUTHOR.user_id,
    author: AUTHOR,
    comments: [
      commentRow({ id: "later", created_at: "2026-10-24T11:00:00.000Z" }),
      commentRow({ id: "earlier", created_at: "2026-10-24T10:00:00.000Z" }),
    ],
    ...overrides,
  };
}

describe("toThread", () => {
  it("maps the row and sorts its comments by creation time", () => {
    const thread = toThread(threadRow());
    expect(thread).toMatchObject({
      id: "00000000-0000-4000-8000-0000000000a1",
      siteId: "00000000-0000-4000-8000-0000000000b1",
      pageUrl: "http://localhost:3000/demo",
      status: "open",
      hasScreenshot: false,
      createdAt: "2026-10-24T09:00:00.000Z",
      context: null,
      author: { id: AUTHOR.user_id, displayName: "Dana", avatarUrl: null },
    });
    expect(thread.anchor).toEqual(ANCHOR);
    expect(thread.comments.map((comment) => comment.id)).toEqual(["earlier", "later"]);
  });

  it("drops an anchor that does not match the schema", () => {
    expect(toThread(threadRow({ anchor: { kind: "unknown" } })).anchor).toBeNull();
  });

  it("marks a thread with a screenshot path as having a screenshot", () => {
    expect(toThread(threadRow({ screenshot_path: "ws/thread.webp" })).hasScreenshot).toBe(true);
  });

  it("names a removed author as a former member", () => {
    const thread = toThread(threadRow({ author: null, created_by: "gone" }));
    expect(thread.author).toEqual({ id: "gone", displayName: FORMER_MEMBER_NAME, avatarUrl: null });
  });
});

describe("toComment", () => {
  it("keeps the body of a deleted comment empty and flags it", () => {
    const comment = toComment(commentRow({ body: "", deleted_at: "2026-10-24T12:00:00.000Z" }));
    expect(comment).toMatchObject({ body: "", deleted: true });
  });

  it("reports the edit time when the comment was edited", () => {
    expect(toComment(commentRow({ edited_at: "2026-10-24T12:30:00.000Z" })).editedAt).toBe(
      "2026-10-24T12:30:00.000Z",
    );
  });
});

describe("toMember", () => {
  it("maps a member with a profile", () => {
    expect(toMember({ role: "guest", profile: AUTHOR })).toEqual({
      id: AUTHOR.user_id,
      displayName: "Dana",
      avatarUrl: null,
      role: "guest",
    });
  });

  it("skips a membership without a profile", () => {
    expect(toMember({ role: "guest", profile: null })).toBeNull();
  });
});
