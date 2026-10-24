import type { Anchor } from "@sitenote/core";
import { describe, expect, it } from "vitest";

import { ORPHANED, type Resolution } from "../anchor-target";
import type { CommentRecord, MemberRecord, SiteInfo, ThreadRecord } from "@sitenote/widget";
import {
  ANCHOR_LABEL_LIMIT,
  UNKNOWN_ANCHOR_LABEL,
  anchorLabel,
  buildMentionCandidates,
  buildThreadViews,
  canChangeStatus,
  upsertComment,
  upsertThread,
} from ".";

const ME = "00000000-0000-4000-8000-000000000002";
const OTHER = "00000000-0000-4000-8000-000000000003";
const THREAD_ID = "30000000-0000-4000-8000-000000000001";

const ELEMENT_ANCHOR: Anchor = {
  kind: "element",
  selectors: { css: "main > button.cta", nthPath: "body > main:nth-of-type(1)" },
  fingerprint: { tag: "button", text: "Book", classes: [], width: 10, height: 10 },
  offset: { x: 0.5, y: 0.5 },
};

const TEXT_ANCHOR: Anchor = {
  kind: "text",
  quote: { exact: "quick brown\n fox", prefix: "", suffix: "" },
  position: { start: 0, end: 5 },
  container: "p",
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
    anchor: ELEMENT_ANCHOR,
    author: { id: ME, displayName: "Me", avatarUrl: null },
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

describe("anchorLabel", () => {
  it("uses the css selector for an element", () => {
    expect(anchorLabel(ELEMENT_ANCHOR)).toBe("main > button.cta");
  });

  it("quotes the text of a text anchor on one line", () => {
    expect(anchorLabel(TEXT_ANCHOR)).toBe("“quick brown fox”");
  });

  it("shortens long quotes and long selectors", () => {
    const long = "x".repeat(ANCHOR_LABEL_LIMIT + 20);

    expect(anchorLabel({ ...TEXT_ANCHOR, quote: { exact: long, prefix: "", suffix: "" } })).toBe(
      `“${"x".repeat(ANCHOR_LABEL_LIMIT)}…”`,
    );
    expect(
      anchorLabel({ ...ELEMENT_ANCHOR, selectors: { css: long, nthPath: "body" } }).length,
    ).toBe(ANCHOR_LABEL_LIMIT);
  });

  it("describes a missing anchor", () => {
    expect(anchorLabel(null)).toBe(UNKNOWN_ANCHOR_LABEL);
  });
});

describe("canChangeStatus", () => {
  const site: SiteInfo = {
    siteId: "20000000-0000-4000-8000-000000000001",
    workspaceId: "10000000-0000-4000-8000-000000000001",
    workspaceName: "Northwind",
    role: "member",
    userId: ME,
    captureErrors: true,
  };
  const foreign = thread({ author: { id: OTHER, displayName: "Other", avatarUrl: null } });

  it("lets owners and members change any thread", () => {
    expect(canChangeStatus({ ...site, role: "owner" }, foreign)).toBe(true);
    expect(canChangeStatus(site, foreign)).toBe(true);
  });

  it("lets a guest change only their own threads", () => {
    const guest = { ...site, role: "guest" } as const;

    expect(canChangeStatus(guest, thread())).toBe(true);
    expect(canChangeStatus(guest, foreign)).toBe(false);
  });
});

describe("buildThreadViews", () => {
  it("numbers threads by creation time and marks unresolved ones as orphaned", () => {
    const late = thread({
      id: "30000000-0000-4000-8000-000000000002",
      createdAt: "2026-10-21T12:00:00.000Z",
    });
    const early = thread();
    const resolutions = new Map<string, Resolution>([[early.id, RESOLVED]]);

    const views = buildThreadViews([late, early], resolutions, ME);

    expect(views.map((view) => [view.id, view.number, view.orphaned])).toEqual([
      [early.id, 1, false],
      [late.id, 2, true],
    ]);
  });

  it("allows editing only own comments that are not deleted", () => {
    const own = comment();
    const foreign = comment({
      id: "50000000-0000-4000-8000-000000000002",
      author: { id: OTHER, displayName: "Other", avatarUrl: null },
    });
    const removed = comment({
      id: "50000000-0000-4000-8000-000000000003",
      deleted: true,
      body: "",
    });

    const [view] = buildThreadViews(
      [thread({ comments: [own, foreign, removed] })],
      new Map([[THREAD_ID, ORPHANED]]),
      ME,
    );

    expect(view?.comments.map((item) => item.canEdit)).toEqual([true, false, false]);
    expect(view?.orphaned).toBe(true);
  });

  it("carries the status, author and label", () => {
    const [view] = buildThreadViews([thread({ status: "resolved", anchor: null })], new Map(), ME);

    expect(view).toMatchObject({
      status: "resolved",
      author: { id: ME },
      anchorLabel: UNKNOWN_ANCHOR_LABEL,
    });
  });
});

const MAX: MemberRecord = { id: ME, displayName: "Max Member", avatarUrl: null, role: "member" };
const MEMBERS: MemberRecord[] = [
  MAX,
  { id: OTHER, displayName: "Olena Owner", avatarUrl: "https://cdn.test/o.png", role: "owner" },
];

describe("buildThreadViews mentions", () => {
  it("resolves the mentioned ids to the display names of the members", () => {
    const mentioning = comment({ body: "cc @Olena Owner", mentions: [OTHER] });

    const [view] = buildThreadViews([thread({ comments: [mentioning] })], new Map(), ME, MEMBERS);

    expect(view?.comments[0]?.mentions).toEqual([{ id: OTHER, displayName: "Olena Owner" }]);
  });

  it("leaves out people who are no longer members and shows no mentions before the members arrive", () => {
    const mentioning = comment({ body: "cc @Olena Owner", mentions: [OTHER] });

    const [withoutMembers] = buildThreadViews([thread({ comments: [mentioning] })], new Map(), ME);
    const [withOthers] = buildThreadViews([thread({ comments: [mentioning] })], new Map(), ME, [
      MAX,
    ]);

    expect(withoutMembers?.comments[0]?.mentions).toEqual([]);
    expect(withOthers?.comments[0]?.mentions).toEqual([]);
  });

  it("drops the mentions of a deleted comment", () => {
    const removed = comment({ deleted: true, body: "", mentions: [OTHER] });

    const [view] = buildThreadViews([thread({ comments: [removed] })], new Map(), ME, MEMBERS);

    expect(view?.comments[0]?.mentions).toEqual([]);
  });
});

describe("buildMentionCandidates", () => {
  it("offers every member except the viewer, without their role", () => {
    expect(buildMentionCandidates(MEMBERS, ME)).toEqual([
      { id: OTHER, displayName: "Olena Owner", avatarUrl: "https://cdn.test/o.png" },
    ]);
  });

  it("offers nobody when the viewer is alone", () => {
    expect(buildMentionCandidates([MAX], ME)).toEqual([]);
    expect(buildMentionCandidates([], ME)).toEqual([]);
  });
});

describe("upsertThread", () => {
  it("appends a new thread and replaces an existing one", () => {
    const first = thread();
    const second = thread({ id: "30000000-0000-4000-8000-000000000002" });

    expect(upsertThread([first], second)).toEqual([first, second]);
    expect(upsertThread([first, second], { ...first, status: "resolved" })).toEqual([
      { ...first, status: "resolved" },
      second,
    ]);
  });
});

describe("upsertComment", () => {
  it("appends a new comment to its thread only", () => {
    const first = thread();
    const second = thread({ id: "30000000-0000-4000-8000-000000000002", comments: [] });
    const added = comment({ id: "50000000-0000-4000-8000-000000000009" });

    const result = upsertComment([first, second], added);

    expect(result[0]?.comments).toHaveLength(2);
    expect(result[1]).toBe(second);
  });

  it("replaces an existing comment instead of duplicating it", () => {
    const edited = comment({ body: "Edited", editedAt: "2026-10-21T11:00:00.000Z" });

    const result = upsertComment([thread()], edited);

    expect(result[0]?.comments).toEqual([edited]);
  });
});
