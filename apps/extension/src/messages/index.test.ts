import { describe, expect, it } from "vitest";

import {
  ERROR_CODES,
  ERROR_MESSAGES,
  RESPONSE_SCHEMAS,
  authRequestSchema,
  authStateChangedSchema,
  authStateSchema,
  commentModeResponseSchema,
  commentModeToggleSchema,
  dataRequestSchema,
  failure,
  notificationsChangedSchema,
  pageClientMessageSchema,
  pageEventSchema,
  requestSchema,
  success,
} from ".";

const SIGNED_IN = {
  status: "signedIn",
  user: { id: "user-1", email: "a@b.test", displayName: "Ann", isAnonymous: false },
} as const;

describe("authRequestSchema", () => {
  it("accepts requests without a payload", () => {
    for (const type of ["auth.getState", "auth.signInWithGoogle", "auth.signOut"]) {
      expect(authRequestSchema.safeParse({ type }).success).toBe(true);
    }
  });

  it("accepts a send-code request and trims the email", () => {
    const result = authRequestSchema.safeParse({ type: "auth.sendCode", email: "  a@b.test " });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ type: "auth.sendCode", email: "a@b.test" });
  });

  it("accepts a verify-code request with six digits", () => {
    expect(
      authRequestSchema.safeParse({ type: "auth.verifyCode", email: "a@b.test", code: "012345" })
        .success,
    ).toBe(true);
  });

  it("strips unknown properties", () => {
    const result = authRequestSchema.safeParse({ type: "auth.signOut", extra: 1 });

    expect(result.data).toEqual({ type: "auth.signOut" });
  });

  it.each([
    ["a missing email", { type: "auth.sendCode" }],
    ["a malformed email", { type: "auth.sendCode", email: "not-an-email" }],
    ["an email that is too long", { type: "auth.sendCode", email: `${"a".repeat(250)}@b.test` }],
    ["a non-string email", { type: "auth.sendCode", email: 1 }],
    ["a short code", { type: "auth.verifyCode", email: "a@b.test", code: "12345" }],
    ["a long code", { type: "auth.verifyCode", email: "a@b.test", code: "1234567" }],
    ["a non-numeric code", { type: "auth.verifyCode", email: "a@b.test", code: "12345a" }],
    ["a code with a newline", { type: "auth.verifyCode", email: "a@b.test", code: "123456\n" }],
    ["a numeric code", { type: "auth.verifyCode", email: "a@b.test", code: 123456 }],
    ["an unknown type", { type: "auth.deleteEverything" }],
    ["a missing type", { email: "a@b.test" }],
    ["a string", "auth.getState"],
    ["null", null],
    ["an array", []],
  ])("rejects %s", (_name, message) => {
    expect(authRequestSchema.safeParse(message).success).toBe(false);
  });
});

describe("authStateSchema", () => {
  it("accepts signed-out and signed-in states", () => {
    expect(authStateSchema.safeParse({ status: "signedOut" }).success).toBe(true);
    expect(authStateSchema.safeParse(SIGNED_IN).success).toBe(true);
  });

  it("accepts a signed-in user without an email", () => {
    expect(
      authStateSchema.safeParse({
        status: "signedIn",
        user: { id: "u", email: null, displayName: "Guest", isAnonymous: true },
      }).success,
    ).toBe(true);
  });

  it("rejects a signed-in state without a user", () => {
    expect(authStateSchema.safeParse({ status: "signedIn" }).success).toBe(false);
  });

  it("rejects an unknown status", () => {
    expect(authStateSchema.safeParse({ status: "pending" }).success).toBe(false);
  });
});

describe("authStateChangedSchema", () => {
  it("accepts a broadcast carrying a state", () => {
    expect(
      authStateChangedSchema.safeParse({ type: "auth.stateChanged", state: SIGNED_IN }).success,
    ).toBe(true);
  });

  it("rejects a broadcast without a valid state", () => {
    expect(
      authStateChangedSchema.safeParse({ type: "auth.stateChanged", state: { status: "x" } })
        .success,
    ).toBe(false);
  });
});

describe("responses", () => {
  it("builds a fixed message for every error code", () => {
    for (const code of ERROR_CODES) {
      expect(failure(code)).toEqual({
        ok: false,
        error: { code, message: ERROR_MESSAGES[code] },
      });
      expect(ERROR_MESSAGES[code]).not.toBe("");
    }
  });

  it("validates a success response against the schema of its request", () => {
    expect(RESPONSE_SCHEMAS["auth.getState"].safeParse(success(SIGNED_IN)).success).toBe(true);
    expect(RESPONSE_SCHEMAS["auth.sendCode"].safeParse(success(null)).success).toBe(true);
    expect(RESPONSE_SCHEMAS["auth.sendCode"].safeParse(success(SIGNED_IN)).success).toBe(false);
  });

  it("accepts an error response for every request type", () => {
    for (const schema of Object.values(RESPONSE_SCHEMAS)) {
      expect(schema.safeParse(failure("rate_limited")).success).toBe(true);
    }
  });

  it("rejects an error response with a code outside the whitelist", () => {
    expect(
      RESPONSE_SCHEMAS["auth.signOut"].safeParse({
        ok: false,
        error: { code: "database_exploded", message: "x" },
      }).success,
    ).toBe(false);
  });

  it("rejects values that are not responses", () => {
    expect(RESPONSE_SCHEMAS["auth.getState"].safeParse(undefined).success).toBe(false);
    expect(RESPONSE_SCHEMAS["auth.getState"].safeParse({ ok: true }).success).toBe(false);
  });
});

const SITE_ID = "20000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const THREAD_ID = "30000000-0000-4000-8000-000000000001";
const PAGE_URL = "https://example.test/pricing";
const ORIGIN = "https://example.test";
const TEXT_ANCHOR = {
  kind: "text",
  quote: { exact: "Price", prefix: "", suffix: "" },
  position: { start: 0, end: 5 },
  container: "body",
};
const PERSON = { id: "u1", displayName: "Ann", avatarUrl: null };
const COMMENT = {
  id: "40000000-0000-4000-8000-000000000001",
  threadId: THREAD_ID,
  author: PERSON,
  body: "Looks wrong",
  createdAt: "2026-10-21T10:00:00.000Z",
  editedAt: null,
  deleted: false,
  mentions: [],
};
const NOTIFICATION = {
  id: "50000000-0000-4000-8000-000000000001",
  kind: "mention",
  threadId: THREAD_ID,
  pageUrl: PAGE_URL,
  threadStatus: "open",
  excerpt: "Please check",
  actorName: "Ann",
  createdAt: "2026-10-21T10:00:00.000Z",
  read: false,
};
const CONTEXT = {
  viewport: { width: 1280, height: 720 },
  devicePixelRatio: 2,
  pageTitle: "Pricing",
  url: PAGE_URL,
  browser: { name: "Chrome", version: "130" },
  os: { name: "Windows", version: "11" },
  userAgent: "ua",
  consoleErrors: [{ kind: "error", message: "Boom", at: "2026-10-22T09:30:00.000Z" }],
  capturedAt: "2026-10-22T09:30:00.000Z",
};
const CAPTURE_ID = "60000000-0000-4000-8000-000000000001";
const RECT = { x: 1, y: 2, width: 30, height: 40 };
const THREAD = {
  id: THREAD_ID,
  siteId: SITE_ID,
  pageUrl: PAGE_URL,
  status: "open",
  anchor: TEXT_ANCHOR,
  author: PERSON,
  createdAt: "2026-10-21T10:00:00.000Z",
  context: CONTEXT,
  hasScreenshot: true,
  comments: [COMMENT],
};
const CREATE = {
  type: "threads.create",
  siteId: SITE_ID,
  pageUrl: PAGE_URL,
  anchor: TEXT_ANCHOR,
  context: CONTEXT,
  body: "  Looks wrong  ",
  mentions: [],
};
const ENABLE = { type: "sites.enable", tabId: 0, origin: ORIGIN, workspaceId: WORKSPACE_ID };

describe("dataRequestSchema", () => {
  it("accepts every data request and trims comment bodies", () => {
    const accepted = [
      { type: "sites.forOrigin", origin: ORIGIN },
      { type: "sites.forOrigin", origin: "http://127.0.0.1:4173" },
      { type: "threads.list", siteId: SITE_ID, pageUrl: PAGE_URL },
      CREATE,
      { ...CREATE, captureId: CAPTURE_ID },
      { type: "threads.screenshotUrl", threadId: THREAD_ID },
      { type: "screenshot.capture", rect: RECT, devicePixelRatio: 2 },
      { type: "preferences.get", siteId: SITE_ID },
      { type: "preferences.set", siteId: SITE_ID, showResolved: true },
      { type: "sites.setErrorCapture", tabId: 3, origin: ORIGIN, enabled: false },
      { type: "threads.setStatus", threadId: THREAD_ID, status: "resolved" },
      { type: "comments.create", threadId: THREAD_ID, body: "Reply", mentions: [WORKSPACE_ID] },
      { type: "comments.update", commentId: THREAD_ID, body: "Edited" },
      { type: "comments.delete", commentId: THREAD_ID },
      { type: "workspaces.list" },
      { type: "members.list", workspaceId: WORKSPACE_ID },
      { type: "notifications.list", limit: 30 },
      { type: "notifications.markRead", ids: [NOTIFICATION.id] },
      { type: "notifications.markAllRead" },
      ENABLE,
      { type: "sites.disable", origin: ORIGIN },
    ];
    for (const request of accepted) {
      expect(dataRequestSchema.safeParse(request).success, request.type).toBe(true);
    }
    expect(dataRequestSchema.safeParse(CREATE).data).toMatchObject({ body: "Looks wrong" });
  });

  it.each([
    ["an origin with a path", { type: "sites.forOrigin", origin: `${ORIGIN}/a` }],
    ["an origin with a trailing slash", { type: "sites.forOrigin", origin: `${ORIGIN}/` }],
    ["a non-http origin", { type: "sites.forOrigin", origin: "chrome://extensions" }],
    [
      "an unnormalised page url",
      { type: "threads.list", siteId: SITE_ID, pageUrl: `${PAGE_URL}/` },
    ],
    [
      "a page url with a query",
      { type: "threads.list", siteId: SITE_ID, pageUrl: `${PAGE_URL}?a=1` },
    ],
    [
      "a javascript page url",
      { type: "threads.list", siteId: SITE_ID, pageUrl: "javascript:alert(1)" },
    ],
    ["a site id that is not a uuid", { type: "threads.list", siteId: "x", pageUrl: PAGE_URL }],
    ["a whitespace body", { ...CREATE, body: " \n " }],
    ["a body over 10000 characters", { ...CREATE, body: "a".repeat(10001) }],
    ["an invalid anchor", { ...CREATE, anchor: { kind: "element" } }],
    ["a context of the old free form", { ...CREATE, context: { viewport: { width: 1 } } }],
    [
      "a context with too many errors",
      {
        ...CREATE,
        context: {
          ...CONTEXT,
          consoleErrors: Array.from({ length: 21 }, () => CONTEXT.consoleErrors[0]),
        },
      },
    ],
    ["a capture id that is not a uuid", { ...CREATE, captureId: "x" }],
    [
      "a thread id that is not a uuid for the screenshot url",
      { type: "threads.screenshotUrl", threadId: "x" },
    ],
    [
      "a capture rect with a negative size",
      { type: "screenshot.capture", rect: { ...RECT, height: -1 }, devicePixelRatio: 1 },
    ],
    [
      "a capture rect with NaN",
      { type: "screenshot.capture", rect: { ...RECT, x: Number.NaN }, devicePixelRatio: 1 },
    ],
    ["a zero ratio", { type: "screenshot.capture", rect: RECT, devicePixelRatio: 0 }],
    ["a ratio above sixteen", { type: "screenshot.capture", rect: RECT, devicePixelRatio: 17 }],
    ["a preference for a site id that is not a uuid", { type: "preferences.get", siteId: "x" }],
    [
      "a preference value that is not a boolean",
      { type: "preferences.set", siteId: SITE_ID, showResolved: "yes" },
    ],
    [
      "an error capture switch without a boolean",
      { type: "sites.setErrorCapture", tabId: 3, origin: ORIGIN, enabled: 1 },
    ],
    ["too many mentions", { ...CREATE, mentions: Array.from({ length: 21 }, () => SITE_ID) }],
    ["a mention that is not a uuid", { ...CREATE, mentions: ["everyone"] }],
    ["an unknown status", { type: "threads.setStatus", threadId: THREAD_ID, status: "done" }],
    ["a negative tab id", { ...ENABLE, tabId: -1 }],
    ["a fractional tab id", { ...ENABLE, tabId: 1.5 }],
    ["an unknown type", { type: "threads.deleteEverything" }],
    ["members of a workspace id that is not a uuid", { type: "members.list", workspaceId: "x" }],
    ["a notification page of zero", { type: "notifications.list", limit: 0 }],
    ["a notification page above the maximum", { type: "notifications.list", limit: 101 }],
    ["a fractional notification page", { type: "notifications.list", limit: 1.5 }],
    ["marking no notification read", { type: "notifications.markRead", ids: [] }],
    ["marking a non-uuid notification read", { type: "notifications.markRead", ids: ["x"] }],
    [
      "marking too many notifications read",
      { type: "notifications.markRead", ids: Array.from({ length: 101 }, () => NOTIFICATION.id) },
    ],
  ])("rejects %s", (_name, message) => {
    expect(dataRequestSchema.safeParse(message).success).toBe(false);
  });

  it("accepts a body of exactly 10000 characters", () => {
    expect(dataRequestSchema.safeParse({ ...CREATE, body: "a".repeat(10000) }).success).toBe(true);
  });

  it("is part of the combined request schema next to the auth requests", () => {
    expect(requestSchema.safeParse({ type: "auth.getState" }).success).toBe(true);
    expect(requestSchema.safeParse({ type: "workspaces.list" }).success).toBe(true);
    expect(requestSchema.safeParse({ type: "nope" }).success).toBe(false);
  });
});

describe("data responses", () => {
  it("validates the data of each request type", () => {
    expect(RESPONSE_SCHEMAS["threads.list"].safeParse(success([THREAD])).success).toBe(true);
    expect(RESPONSE_SCHEMAS["threads.create"].safeParse(success(THREAD)).success).toBe(true);
    expect(RESPONSE_SCHEMAS["comments.update"].safeParse(success(COMMENT)).success).toBe(true);
    expect(RESPONSE_SCHEMAS["sites.enable"].safeParse(success(null)).success).toBe(true);
    expect(RESPONSE_SCHEMAS["sites.forOrigin"].safeParse(success(null)).success).toBe(true);
    expect(
      RESPONSE_SCHEMAS["sites.forOrigin"].safeParse(
        success({
          siteId: SITE_ID,
          workspaceId: WORKSPACE_ID,
          workspaceName: "Northwind",
          role: "guest",
          userId: THREAD_ID,
          captureErrors: false,
        }),
      ).success,
    ).toBe(true);
    expect(
      RESPONSE_SCHEMAS["workspaces.list"].safeParse(
        success([{ id: WORKSPACE_ID, name: "Northwind", role: "owner" }]),
      ).success,
    ).toBe(true);
  });

  it("validates the screenshot, capture and preference responses", () => {
    expect(
      RESPONSE_SCHEMAS["threads.screenshotUrl"].safeParse(success("https://storage.test/s.webp"))
        .success,
    ).toBe(true);
    expect(RESPONSE_SCHEMAS["threads.screenshotUrl"].safeParse(success(null)).success).toBe(true);
    expect(
      RESPONSE_SCHEMAS["threads.screenshotUrl"].safeParse(success("javascript:alert(1)")).success,
    ).toBe(false);
    expect(
      RESPONSE_SCHEMAS["threads.screenshotUrl"].safeParse(success("data:image/png;base64,AAAA"))
        .success,
    ).toBe(false);
    expect(
      RESPONSE_SCHEMAS["screenshot.capture"].safeParse(
        success({ captureId: CAPTURE_ID, width: 10, height: 20 }),
      ).success,
    ).toBe(true);
    expect(
      RESPONSE_SCHEMAS["screenshot.capture"].safeParse(
        success({ captureId: CAPTURE_ID, width: 0, height: 20 }),
      ).success,
    ).toBe(false);
    expect(
      RESPONSE_SCHEMAS["preferences.get"].safeParse(success({ showResolved: true })).success,
    ).toBe(true);
    expect(RESPONSE_SCHEMAS["preferences.get"].safeParse(success({})).success).toBe(false);
    expect(RESPONSE_SCHEMAS["preferences.set"].safeParse(success(null)).success).toBe(true);
    expect(RESPONSE_SCHEMAS["sites.setErrorCapture"].safeParse(success(null)).success).toBe(true);
    expect(failure("capture_failed").error.message).toBe("The screenshot could not be taken.");
  });

  it("accepts a thread whose context was invalid and is null", () => {
    expect(
      RESPONSE_SCHEMAS["threads.list"].safeParse(success([{ ...THREAD, context: null }])).success,
    ).toBe(true);
    expect(
      RESPONSE_SCHEMAS["threads.list"].safeParse(success([{ ...THREAD, context: {} }])).success,
    ).toBe(false);
  });

  it("validates members and notifications", () => {
    expect(
      RESPONSE_SCHEMAS["members.list"].safeParse(
        success([{ id: THREAD_ID, displayName: "Ann", avatarUrl: null, role: "member" }]),
      ).success,
    ).toBe(true);
    expect(
      RESPONSE_SCHEMAS["members.list"].safeParse(
        success([{ id: THREAD_ID, displayName: "Ann", avatarUrl: null, role: "admin" }]),
      ).success,
    ).toBe(false);
    expect(
      RESPONSE_SCHEMAS["notifications.list"].safeParse(
        success({ items: [NOTIFICATION], unread: 1 }),
      ).success,
    ).toBe(true);
    expect(
      RESPONSE_SCHEMAS["notifications.list"].safeParse(
        success({ items: [{ ...NOTIFICATION, kind: "like" }], unread: 1 }),
      ).success,
    ).toBe(false);
    expect(
      RESPONSE_SCHEMAS["notifications.list"].safeParse(success({ items: [], unread: -1 })).success,
    ).toBe(false);
    expect(RESPONSE_SCHEMAS["notifications.markRead"].safeParse(success(null)).success).toBe(true);
    expect(RESPONSE_SCHEMAS["notifications.markAllRead"].safeParse(success(null)).success).toBe(
      true,
    );
  });

  it("requires the mentions of a comment", () => {
    const withoutMentions = Object.fromEntries(
      Object.entries(COMMENT).filter(([key]) => key !== "mentions"),
    );

    expect(RESPONSE_SCHEMAS["comments.create"].safeParse(success(withoutMentions)).success).toBe(
      false,
    );
  });

  it("accepts a thread whose anchor could not be read", () => {
    expect(
      RESPONSE_SCHEMAS["threads.list"].safeParse(success([{ ...THREAD, anchor: null }])).success,
    ).toBe(true);
  });

  it("rejects data of the wrong shape", () => {
    expect(
      RESPONSE_SCHEMAS["threads.list"].safeParse(success([{ ...THREAD, status: "x" }])).success,
    ).toBe(false);
    expect(RESPONSE_SCHEMAS["threads.list"].safeParse(success(THREAD)).success).toBe(false);
    expect(
      RESPONSE_SCHEMAS["comments.create"].safeParse(success({ ...COMMENT, createdAt: "yesterday" }))
        .success,
    ).toBe(false);
  });

  it("carries the whitelisted data error codes", () => {
    for (const code of [
      "unauthorized",
      "forbidden",
      "not_found",
      "validation",
      "network",
      "unknown",
    ] as const) {
      expect(ERROR_CODES).toContain(code);
      expect(RESPONSE_SCHEMAS["threads.list"].safeParse(failure(code)).success).toBe(true);
    }
  });
});

describe("notificationsChangedSchema", () => {
  it("accepts a broadcast with a non-negative unread count", () => {
    expect(
      notificationsChangedSchema.safeParse({ type: "notifications.changed", unread: 0 }).success,
    ).toBe(true);
    expect(
      notificationsChangedSchema.safeParse({ type: "notifications.changed", unread: -1 }).success,
    ).toBe(false);
    expect(notificationsChangedSchema.safeParse({ type: "notifications.changed" }).success).toBe(
      false,
    );
  });
});

describe("page messages", () => {
  it("accepts a subscription and an update with normalised page urls", () => {
    expect(
      pageClientMessageSchema.safeParse({
        type: "page.subscribe",
        siteId: SITE_ID,
        workspaceId: WORKSPACE_ID,
        pageUrl: PAGE_URL,
      }).success,
    ).toBe(true);
    expect(
      pageClientMessageSchema.safeParse({ type: "page.update", pageUrl: PAGE_URL }).success,
    ).toBe(true);
  });

  it.each([
    ["an unnormalised page url", { type: "page.update", pageUrl: `${PAGE_URL}#top` }],
    [
      "a subscription without a site",
      { type: "page.subscribe", workspaceId: WORKSPACE_ID, pageUrl: PAGE_URL },
    ],
    ["an unknown type", { type: "page.hack" }],
  ])("rejects %s", (_name, message) => {
    expect(pageClientMessageSchema.safeParse(message).success).toBe(false);
  });

  it("accepts the events the background sends and nothing else", () => {
    for (const event of [
      { type: "page.subscribed" },
      { type: "threads.changed", threadId: THREAD_ID },
      { type: "comments.changed", threadId: THREAD_ID },
      { type: "site.disabled" },
    ]) {
      expect(pageEventSchema.safeParse(event).success, event.type).toBe(true);
    }
    expect(pageEventSchema.safeParse({ type: "threads.changed" }).success).toBe(false);
    expect(pageEventSchema.safeParse({ type: "comments.changed", threadId: "x" }).success).toBe(
      false,
    );
    expect(pageEventSchema.safeParse({ type: "other" }).success).toBe(false);
  });
});

describe("comment mode messages", () => {
  it("accepts the toggle and its response", () => {
    expect(commentModeToggleSchema.safeParse({ type: "commentMode.toggle" }).success).toBe(true);
    expect(commentModeResponseSchema.safeParse(success({ active: true })).success).toBe(true);
    expect(commentModeResponseSchema.safeParse(failure("page_unavailable")).success).toBe(true);
    expect(commentModeResponseSchema.safeParse(success({ active: "yes" })).success).toBe(false);
  });
});
