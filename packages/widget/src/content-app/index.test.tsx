import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStore, type Store } from "../store";
import { ORPHANED, type Resolution } from "../anchor-target";
import type { CommentRecord, MemberRecord, SiteInfo, ThreadRecord } from "../transport";
import type { PinMeasurement } from "../pin-tracker";

import {
  PENDING_ID,
  SELECTION_ID,
  type ContentController,
  type ContentState,
} from "../content-controller";
import { Z_INDEX } from "@sitenote/ui";

import { ContentApp } from ".";

const ME = "00000000-0000-4000-8000-000000000002";
const OTHER = "00000000-0000-4000-8000-000000000003";
const SITE: SiteInfo = {
  siteId: "20000000-0000-4000-8000-000000000001",
  workspaceId: "10000000-0000-4000-8000-000000000001",
  workspaceName: "Northwind",
  role: "member",
  userId: ME,
  captureErrors: true,
};
const OLENA = "00000000-0000-4000-8000-000000000001";
const ME_MEMBER: MemberRecord = { id: ME, displayName: "Me", avatarUrl: null, role: "member" };
const MEMBERS: MemberRecord[] = [
  { id: OLENA, displayName: "Olena Owner", avatarUrl: null, role: "owner" },
  ME_MEMBER,
  { id: OTHER, displayName: "Other", avatarUrl: null, role: "guest" },
];
const FIRST_ID = "30000000-0000-4000-8000-000000000001";
const SECOND_ID = "30000000-0000-4000-8000-000000000002";

function comment(threadId: string, overrides: Partial<CommentRecord> = {}): CommentRecord {
  return {
    id: `40000000-0000-4000-8000-${threadId.slice(-12)}`,
    threadId,
    author: { id: ME, displayName: "Me", avatarUrl: null },
    body: "A first comment",
    createdAt: "2026-10-21T10:00:00.000Z",
    editedAt: null,
    deleted: false,
    mentions: [],
    ...overrides,
  };
}

function thread(id: string, overrides: Partial<ThreadRecord> = {}): ThreadRecord {
  return {
    id,
    siteId: SITE.siteId,
    pageUrl: "https://example.test/",
    status: "open",
    anchor: null,
    author: { id: ME, displayName: "Me", avatarUrl: null },
    createdAt: id === FIRST_ID ? "2026-10-21T10:00:00.000Z" : "2026-10-21T11:00:00.000Z",
    context: null,
    hasScreenshot: false,
    comments: [comment(id)],
    ...overrides,
  };
}

const RESOLVED: Resolution = {
  status: "resolved",
  target: { kind: "text", range: document.createRange() },
};

function measurement(
  x: number,
  y: number,
  overrides: Partial<PinMeasurement> = {},
): PinMeasurement {
  return {
    x,
    y,
    pageX: x,
    pageY: y,
    rect: { x: x - 20, y: y - 10, width: 40, height: 20 },
    rects: [],
    visible: true,
    near: true,
    ...overrides,
  };
}

function makeState(overrides: Partial<ContentState> = {}): ContentState {
  return {
    status: "ready",
    site: SITE,
    live: true,
    threads: [],
    siteThreads: [],
    members: [],
    screenshots: new Map(),
    recordings: new Map(),
    recordingAttached: false,
    resolutions: new Map(),
    positions: new Map(),
    commentMode: false,
    hover: null,
    activeThreadId: null,
    pending: null,
    selection: null,
    sidebarOpen: false,
    showResolved: false,
    toasts: [],
    panelError: undefined,
    fallbackHighlights: false,
    clickUpConfigured: false,
    clickUpPending: new Set<string>(),
    jiraConfigured: false,
    jiraPending: new Set<string>(),
    shares: new Map(),
    sharePending: new Set<string>(),
    selectionPlacement: "below",
    replayAvailable: false,
    replay: null,
    replayGate: null,
    offPageThreadId: null,
    ...overrides,
  };
}

function makeController(store: Store<ContentState>) {
  const actions = {
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(),
    toggleCommentMode: vi.fn(() => true),
    exitCommentMode: vi.fn(),
    enterCommentMode: vi.fn(() => true),
    attachRecording: vi.fn(() => true),
    commentOnContextTarget: vi.fn(() => false),
    toggleSidebar: vi.fn(),
    closeSidebar: vi.fn(),
    setShowResolved: vi.fn(),
    selectThread: vi.fn(),
    openThread: vi.fn(() => false),
    togglePin: vi.fn(),
    closePanel: vi.fn(),
    startTextComment: vi.fn(),
    submitNewThread: vi.fn(() => Promise.resolve()),
    reply: vi.fn(() => Promise.resolve()),
    editComment: vi.fn(() => Promise.resolve()),
    deleteComment: vi.fn(() => Promise.resolve()),
    toggleStatus: vi.fn(() => Promise.resolve()),
    createClickUpTask: vi.fn(() => Promise.resolve()),
    linkJiraIssue: vi.fn(() => Promise.resolve()),
    setShareAccess: vi.fn(() => Promise.resolve()),
    copyThreadLink: vi.fn(() => Promise.resolve(true)),
    dismissToast: vi.fn(),
    startReplay: vi.fn(),
    gateRun: vi.fn(),
    gateClose: vi.fn(),
    closeOffPage: vi.fn(),
    openOffPagePage: vi.fn(),
    reproduceOffPage: vi.fn(),
    copyRoute: vi.fn(),
    replayNext: vi.fn(),
    replayBack: vi.fn(),
    replayPause: vi.fn(),
    replayResume: vi.fn(),
    replaySkip: vi.fn(),
    replayRetry: vi.fn(),
    replayStop: vi.fn(),
  };
  const controller: ContentController = { store, ...actions };
  return { controller, actions };
}

function setup(overrides: Partial<ContentState> = {}) {
  const store = createStore(makeState(overrides));
  const { controller, actions } = makeController(store);
  render(<ContentApp controller={controller} />);
  return { store, actions };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("launcher and sidebar", () => {
  it("shows the number of open threads on the launcher", () => {
    setup({
      threads: [thread(FIRST_ID), thread(SECOND_ID, { status: "resolved" })],
      resolutions: new Map([[FIRST_ID, RESOLVED]]),
    });

    expect(screen.getByRole("button", { name: "Comments, 1 open" })).toBeTruthy();
  });

  it("opens the sidebar from the launcher", async () => {
    const user = userEvent.setup();
    const { actions } = setup();

    await user.click(screen.getByRole("button", { name: "Comments, 0 open" }));

    expect(actions.toggleSidebar).toHaveBeenCalledTimes(1);
  });

  it("lists placed and orphaned threads and selects one", async () => {
    const user = userEvent.setup();
    const { actions } = setup({
      sidebarOpen: true,
      threads: [
        thread(FIRST_ID),
        thread(SECOND_ID, { comments: [comment(SECOND_ID, { body: "Lost one" })] }),
      ],
      resolutions: new Map<string, Resolution>([
        [FIRST_ID, RESOLVED],
        [SECOND_ID, ORPHANED],
      ]),
    });

    expect(screen.queryByRole("button", { name: /^Comments, \d+ open$/ })).toBeNull();
    const orphaned = screen.getByRole("region", { name: "Orphaned" });
    await user.click(within(orphaned).getByRole("button"));

    expect(actions.selectThread).toHaveBeenCalledWith(SECOND_ID);
  });

  it("moves focus into the sidebar when it opens and back to the launcher when it closes", () => {
    const { store } = setup();

    act(() => {
      store.setState((state) => ({ ...state, sidebarOpen: true }));
    });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close comments" }));

    act(() => {
      store.setState((state) => ({ ...state, sidebarOpen: false }));
    });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Comments, / }));
  });

  it("lists resolved threads and reports the toggle to the controller", async () => {
    const user = userEvent.setup();
    const { actions, store } = setup({
      sidebarOpen: true,
      threads: [thread(FIRST_ID), thread(SECOND_ID, { status: "resolved" })],
      resolutions: new Map<string, Resolution>([
        [FIRST_ID, RESOLVED],
        [SECOND_ID, RESOLVED],
      ]),
    });
    const section = screen.getByRole("region", { name: "On this page" });
    expect(within(section).getAllByRole("button")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Show resolved (1)" }));
    expect(actions.setShowResolved).toHaveBeenCalledExactlyOnceWith(true);

    act(() => {
      store.setState((state) => ({ ...state, showResolved: true }));
    });
    expect(screen.getByRole("button", { name: "Hide resolved (1)" })).toBeTruthy();
    expect(within(section).getAllByRole("button")).toHaveLength(2);
  });

  it("closes the sidebar from its close button", async () => {
    const user = userEvent.setup();
    const { actions } = setup({ sidebarOpen: true });

    await user.click(screen.getByRole("button", { name: "Close comments" }));

    expect(actions.closeSidebar).toHaveBeenCalledTimes(1);
  });
});

describe("pins", () => {
  const threads = [thread(FIRST_ID), thread(SECOND_ID, { status: "resolved" })];
  const resolutions = new Map<string, Resolution>([
    [FIRST_ID, RESOLVED],
    [SECOND_ID, RESOLVED],
  ]);

  it("draws a pin for every placed open thread and numbers them by creation time", () => {
    setup({
      threads,
      resolutions,
      positions: new Map([
        [FIRST_ID, measurement(100, 200)],
        [SECOND_ID, measurement(300, 400)],
      ]),
    });

    const pin = screen.getByRole("button", { name: "Thread 1, open" });
    expect(pin.style.left).toBe("88px");
    expect(pin.style.top).toBe("188px");
  });

  it("hides the pin of a resolved thread until it is opened", () => {
    const positions = new Map([
      [FIRST_ID, measurement(100, 200)],
      [SECOND_ID, measurement(300, 400)],
    ]);
    const { store } = setup({ threads, resolutions, positions });
    expect(screen.queryByRole("button", { name: "Thread 2, resolved" })).toBeNull();

    act(() => {
      store.setState((state) => ({ ...state, activeThreadId: SECOND_ID }));
    });

    expect(screen.getByRole("button", { name: "Thread 2, resolved" })).toBeTruthy();
  });

  it("draws the pins of resolved threads when they are shown", () => {
    const positions = new Map([
      [FIRST_ID, measurement(100, 200)],
      [SECOND_ID, measurement(300, 400)],
    ]);
    const { store } = setup({ threads, resolutions, positions, showResolved: true });

    expect(screen.getByRole("button", { name: "Thread 2, resolved" })).toBeTruthy();

    act(() => {
      store.setState((state) => ({ ...state, showResolved: false }));
    });

    expect(screen.queryByRole("button", { name: "Thread 2, resolved" })).toBeNull();
  });

  it("hides pins that are outside the viewport and pins of orphaned threads", () => {
    setup({
      threads,
      resolutions: new Map<string, Resolution>([
        [FIRST_ID, RESOLVED],
        [SECOND_ID, ORPHANED],
      ]),
      positions: new Map([
        [FIRST_ID, measurement(-50, 200, { visible: false, near: false })],
        [SECOND_ID, measurement(300, 400)],
      ]),
    });

    expect(screen.queryByRole("button", { name: /^Thread \d/ })).toBeNull();
  });

  it("opens a thread when its pin is pressed", async () => {
    const user = userEvent.setup();
    const { actions } = setup({
      threads: [thread(FIRST_ID)],
      resolutions: new Map([[FIRST_ID, RESOLVED]]),
      positions: new Map([[FIRST_ID, measurement(100, 200)]]),
    });

    await user.click(screen.getByRole("button", { name: "Thread 1, open" }));

    expect(actions.togglePin).toHaveBeenCalledWith(FIRST_ID);
  });

  it("draws the pending pin after the existing threads", () => {
    setup({
      threads: [thread(FIRST_ID)],
      resolutions: new Map([[FIRST_ID, RESOLVED]]),
      positions: new Map([
        [FIRST_ID, measurement(100, 200)],
        [PENDING_ID, measurement(300, 400)],
      ]),
      pending: {
        anchor: {
          kind: "text",
          quote: { exact: "a", prefix: "", suffix: "" },
          position: { start: 0, end: 1 },
          container: "p",
        },
        target: { kind: "text", range: document.createRange() },
        captureId: null,
      },
    });

    expect(screen.getByRole("button", { name: "Thread 2, pending" })).toBeTruthy();
  });
});

describe("comment mode and selection", () => {
  it("shows the banner and the hover box only in comment mode", async () => {
    const user = userEvent.setup();
    const hover = { x: 10, y: 20, width: 100, height: 40 };
    const { actions, store } = setup({ commentMode: true, hover });

    expect(screen.getByText(/Comment mode: click an element/)).toBeTruthy();
    expect(screen.getByTestId("sitenote-highlight")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Exit" }));
    expect(actions.exitCommentMode).toHaveBeenCalledTimes(1);

    act(() => {
      store.setState((state) => ({ ...state, commentMode: false }));
    });
    expect(screen.queryByText(/Comment mode: click an element/)).toBeNull();
    expect(screen.queryByTestId("sitenote-highlight")).toBeNull();
  });

  it("offers a Comment button next to the selection and starts a text comment", async () => {
    const user = userEvent.setup();
    const { actions } = setup({
      selection: document.createRange(),
      positions: new Map([[SELECTION_ID, measurement(200, 200)]]),
    });

    await user.click(screen.getByRole("button", { name: "Comment" }));

    expect(actions.startTextComment).toHaveBeenCalledTimes(1);
  });

  it("places the Comment button below the selection by default", () => {
    setup({
      selection: document.createRange(),
      positions: new Map([[SELECTION_ID, measurement(200, 200)]]),
    });

    expect(screen.getByRole("button", { name: "Comment" }).style.top).toBe("218px");
  });

  it("places the Comment button above the selection when the setting says so", () => {
    setup({
      selection: document.createRange(),
      positions: new Map([[SELECTION_ID, measurement(200, 200)]]),
      selectionPlacement: "above",
    });

    expect(screen.getByRole("button", { name: "Comment" }).style.top).toBe("150px");
  });

  it("hides the Comment button when the selection is out of view", () => {
    setup({
      selection: document.createRange(),
      positions: new Map([[SELECTION_ID, measurement(200, 200, { visible: false })]]),
    });

    expect(screen.queryByRole("button", { name: "Comment" })).toBeNull();
  });

  it("draws highlight boxes only when the Custom Highlight API is missing", () => {
    const rects = [
      { x: 1, y: 1, width: 10, height: 10 },
      { x: 1, y: 20, width: 10, height: 10 },
    ];
    const positions = new Map([
      [FIRST_ID, measurement(100, 200, { rects })],
      [SELECTION_ID, measurement(100, 200, { rects })],
    ]);
    const { store } = setup({ positions });
    expect(screen.queryAllByTestId("sitenote-highlight")).toHaveLength(0);

    act(() => {
      store.setState((state) => ({ ...state, fallbackHighlights: true }));
    });

    expect(screen.getAllByTestId("sitenote-highlight")).toHaveLength(2);
  });
});

describe("thread panel", () => {
  const pending = {
    anchor: {
      kind: "text" as const,
      quote: { exact: "a", prefix: "", suffix: "" },
      position: { start: 0, end: 1 },
      container: "p",
    },
    target: { kind: "text" as const, range: document.createRange() },
    captureId: null,
  };

  it("shows the context and the signed screenshot of the open thread", () => {
    setup({
      threads: [thread(FIRST_ID, { hasScreenshot: true })],
      resolutions: new Map([[FIRST_ID, RESOLVED]]),
      positions: new Map([[FIRST_ID, measurement(100, 200)]]),
      activeThreadId: FIRST_ID,
      screenshots: new Map([[FIRST_ID, { status: "ready", url: "https://storage.test/s.webp" }]]),
    });

    const section = screen.getByRole("region", { name: "Page context" });

    expect(within(section).getByRole("link").getAttribute("href")).toBe(
      "https://storage.test/s.webp",
    );
    expect(within(section).getByText("Context unavailable")).toBeTruthy();
  });

  it("shows a loading state while the screenshot url is requested", () => {
    setup({
      threads: [thread(FIRST_ID, { hasScreenshot: true })],
      resolutions: new Map([[FIRST_ID, RESOLVED]]),
      positions: new Map([[FIRST_ID, measurement(100, 200)]]),
      activeThreadId: FIRST_ID,
      screenshots: new Map([[FIRST_ID, { status: "loading" }]]),
    });

    expect(screen.getByText("Loading screenshot…")).toBeTruthy();
  });

  it("shows the replay frame and keeps Stop available while waiting", async () => {
    const user = userEvent.setup();
    const { actions } = setup({
      replay: {
        view: { mode: "step", index: 0, total: 3, status: "waiting", label: "Preparing replay…" },
        highlight: null,
      },
    });

    expect(screen.getByTestId("sitenote-replay-frame")).toBeTruthy();
    expect(screen.getByText("Sitenote is controlling this page")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Stop replay" }));
    expect(actions.replayStop).toHaveBeenCalledOnce();
  });

  it("shows one visible completion message at the end of a replay", () => {
    setup({
      replay: {
        view: { mode: "step", index: 2, total: 3, status: "done", label: "Replay finished" },
        highlight: null,
      },
    });

    const controls = within(screen.getByRole("region", { name: "Replay controls" }));
    expect(controls.getAllByText("Replay finished", { selector: ":not(.sr-only)" })).toHaveLength(
      1,
    );
    expect(controls.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.queryByTestId("sitenote-replay-frame")).toBeNull();
  });

  it("plays the signed recording of the open thread", () => {
    setup({
      threads: [
        thread(FIRST_ID, {
          context: {
            viewport: { width: 1440, height: 900 },
            devicePixelRatio: 2,
            pageTitle: "Northwind",
            url: "https://example.test/",
            browser: { name: "Chrome", version: "130" },
            os: { name: "Windows", version: "11" },
            userAgent: "ua",
            consoleErrors: [],
            capturedAt: "2026-10-21T10:00:00.000Z",
            recording: { path: "ws/thread.webm", durationMs: 9_000, size: 2048 },
          },
        }),
      ],
      resolutions: new Map([[FIRST_ID, RESOLVED]]),
      positions: new Map([[FIRST_ID, measurement(100, 200)]]),
      activeThreadId: FIRST_ID,
      recordings: new Map([[FIRST_ID, { status: "ready", url: "https://storage.test/r.webm" }]]),
    });

    const section = screen.getByRole("region", { name: "Page context" });

    expect(within(section).getByLabelText("Screen recording").getAttribute("src")).toBe(
      "https://storage.test/r.webm",
    );
  });

  it("opens the new thread form for a pending thread and submits through the controller", async () => {
    const user = userEvent.setup();
    const { actions } = setup({
      pending,
      positions: new Map([[PENDING_ID, measurement(100, 100)]]),
    });

    const dialog = screen.getByRole("dialog", { name: "New thread" });
    await user.type(within(dialog).getByRole("textbox", { name: "Comment" }), "Hello there");
    await user.click(within(dialog).getByRole("button", { name: /^Comment$/ }));

    expect(actions.submitNewThread).toHaveBeenCalledWith({ body: "Hello there", mentions: [] });
  });

  it("cancels the pending thread", async () => {
    const user = userEvent.setup();
    const { actions } = setup({ pending });

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(actions.closePanel).toHaveBeenCalledTimes(1);
  });

  it("shows the error of a failed submission", () => {
    setup({ pending, panelError: "Sitenote could not reach the server." });

    expect(screen.getByRole("alert").textContent).toBe("Sitenote could not reach the server.");
  });

  it("links a Jira issue to the open thread through the controller", async () => {
    const user = userEvent.setup();
    const { actions } = setup({
      jiraConfigured: true,
      threads: [thread(FIRST_ID)],
      resolutions: new Map([[FIRST_ID, RESOLVED]]),
      positions: new Map([[FIRST_ID, measurement(100, 200)]]),
      activeThreadId: FIRST_ID,
    });

    const dialog = screen.getByRole("dialog", { name: "Thread 1" });
    await user.type(within(dialog).getByRole("textbox", { name: "Jira issue key" }), "proj-7");
    await user.click(within(dialog).getByRole("button", { name: "Link Jira issue" }));

    expect(actions.linkJiraIssue).toHaveBeenCalledWith(FIRST_ID, "PROJ-7");
  });

  it("shows the linked Jira issue of the open thread", () => {
    setup({
      threads: [
        thread(FIRST_ID, {
          jiraIssueKey: "PROJ-7",
          jiraIssueUrl: "https://org.atlassian.net/browse/PROJ-7",
        }),
      ],
      resolutions: new Map([[FIRST_ID, RESOLVED]]),
      positions: new Map([[FIRST_ID, measurement(100, 200)]]),
      activeThreadId: FIRST_ID,
    });

    const dialog = screen.getByRole("dialog", { name: "Thread 1" });
    expect(within(dialog).getByRole("link", { name: "Jira PROJ-7" }).getAttribute("href")).toBe(
      "https://org.atlassian.net/browse/PROJ-7",
    );
  });

  it("changes the access of the open thread through the controller", async () => {
    const user = userEvent.setup();
    const { actions } = setup({
      threads: [thread(FIRST_ID)],
      resolutions: new Map([[FIRST_ID, RESOLVED]]),
      positions: new Map([[FIRST_ID, measurement(100, 200)]]),
      activeThreadId: FIRST_ID,
    });

    const dialog = screen.getByRole("dialog", { name: "Thread 1" });
    await user.click(within(dialog).getByRole("button", { name: "Who can open the link" }));
    await user.click(within(dialog).getByRole("menuitemradio", { name: "Anyone with the link" }));

    expect(actions.setShareAccess).toHaveBeenCalledWith(FIRST_ID, "link");
  });

  it("shows the access of a shared thread and copies its link through the controller", async () => {
    const user = userEvent.setup();
    const { actions } = setup({
      threads: [thread(FIRST_ID)],
      resolutions: new Map([[FIRST_ID, RESOLVED]]),
      positions: new Map([[FIRST_ID, measurement(100, 200)]]),
      activeThreadId: FIRST_ID,
      shares: new Map([
        [FIRST_ID, { token: "a".repeat(64), expiresAt: "2026-12-14T10:00:00.000Z" }],
      ]),
    });

    const dialog = screen.getByRole("dialog", { name: "Thread 1" });
    await user.click(within(dialog).getByRole("button", { name: "Who can open the link" }));
    expect(
      within(dialog)
        .getByRole("menuitemradio", { name: "Anyone with the link" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    await user.keyboard("{Escape}");
    await user.click(within(dialog).getByRole("button", { name: "Copy link" }));

    expect(actions.copyThreadLink).toHaveBeenCalledWith(FIRST_ID);
    expect(await within(dialog).findByRole("button", { name: "Copied" })).toBeTruthy();
  });

  it("hides the share control from guests", () => {
    setup({
      site: { ...SITE, role: "guest" },
      threads: [thread(FIRST_ID)],
      resolutions: new Map([[FIRST_ID, RESOLVED]]),
      positions: new Map([[FIRST_ID, measurement(100, 200)]]),
      activeThreadId: FIRST_ID,
    });

    const dialog = screen.getByRole("dialog", { name: "Thread 1" });
    expect(within(dialog).queryByRole("button", { name: "Who can open the link" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Copy link" })).toBeNull();
  });

  it("opens the active thread and replies through the controller", async () => {
    const user = userEvent.setup();
    const { actions } = setup({
      threads: [thread(FIRST_ID)],
      resolutions: new Map([[FIRST_ID, RESOLVED]]),
      positions: new Map([[FIRST_ID, measurement(100, 200)]]),
      activeThreadId: FIRST_ID,
    });

    const dialog = screen.getByRole("dialog", { name: "Thread 1" });
    await user.type(within(dialog).getByRole("textbox", { name: "Reply" }), "Thanks");
    await user.click(within(dialog).getByRole("button", { name: /^Reply$/ }));

    expect(within(dialog).getByText("A first comment")).toBeTruthy();
    expect(actions.reply).toHaveBeenCalledWith(FIRST_ID, { body: "Thanks", mentions: [] });
  });

  it("offers the other members when typing an @ and sends the picked person", async () => {
    const user = userEvent.setup();
    const { actions } = setup({
      threads: [thread(FIRST_ID)],
      members: MEMBERS,
      resolutions: new Map([[FIRST_ID, RESOLVED]]),
      positions: new Map([[FIRST_ID, measurement(100, 200)]]),
      activeThreadId: FIRST_ID,
    });

    const dialog = screen.getByRole("dialog", { name: "Thread 1" });
    await user.type(within(dialog).getByRole("textbox", { name: "Reply" }), "@o");

    expect(
      within(dialog)
        .getAllByRole("option")
        .filter((option) => option.closest("select") === null)
        .map((option) => option.textContent),
    ).toEqual(["OOlena Owner", "OOther"]);

    await user.keyboard("{Enter}");
    await user.click(within(dialog).getByRole("button", { name: /^Reply$/ }));

    expect(actions.reply).toHaveBeenCalledWith(FIRST_ID, {
      body: "@Olena Owner",
      mentions: [OLENA],
    });
  });

  it("does not offer the viewer themselves and offers nobody before the members are known", async () => {
    const user = userEvent.setup();
    setup({
      pending,
      members: [ME_MEMBER],
      positions: new Map([[PENDING_ID, measurement(100, 100)]]),
    });

    await user.type(screen.getByRole("textbox", { name: "Comment" }), "@m");

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("highlights the mentions of a comment", () => {
    setup({
      threads: [
        thread(FIRST_ID, {
          comments: [comment(FIRST_ID, { body: "cc @Olena Owner", mentions: [OLENA] })],
        }),
      ],
      members: MEMBERS,
      resolutions: new Map([[FIRST_ID, RESOLVED]]),
      positions: new Map([[FIRST_ID, measurement(100, 200)]]),
      activeThreadId: FIRST_ID,
    });

    const mark = document.querySelector("[data-mention]");

    expect(mark?.textContent).toBe("@Olena Owner");
    expect(mark?.getAttribute("data-mention")).toBe(OLENA);
  });

  it("lets the author edit and delete only their own comments", async () => {
    const user = userEvent.setup();
    const foreign = comment(FIRST_ID, {
      id: "40000000-0000-4000-8000-000000000099",
      author: { id: OTHER, displayName: "Other", avatarUrl: null },
      body: "Someone else wrote this",
    });
    const { actions } = setup({
      threads: [thread(FIRST_ID, { comments: [comment(FIRST_ID), foreign] })],
      resolutions: new Map([[FIRST_ID, RESOLVED]]),
      positions: new Map([[FIRST_ID, measurement(100, 200)]]),
      activeThreadId: FIRST_ID,
    });

    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByRole("textbox", { name: "Edit comment" }));
    await user.type(screen.getByRole("textbox", { name: "Edit comment" }), "Changed");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(actions.editComment).toHaveBeenCalledWith(comment(FIRST_ID).id, "Changed");
  });

  it("lets a member change the status of a thread somebody else started", async () => {
    const user = userEvent.setup();
    const base = {
      threads: [thread(FIRST_ID, { author: { id: OTHER, displayName: "Other", avatarUrl: null } })],
      resolutions: new Map([[FIRST_ID, RESOLVED]]),
      positions: new Map([[FIRST_ID, measurement(100, 200)]]),
      activeThreadId: FIRST_ID,
    };
    const { actions } = setup(base);

    await user.click(screen.getByRole("button", { name: "Resolve" }));
    expect(actions.toggleStatus).toHaveBeenCalledWith(FIRST_ID);
  });

  it("hides the status toggle from a guest who did not start the thread", () => {
    setup({
      site: { ...SITE, role: "guest" },
      threads: [thread(FIRST_ID, { author: { id: OTHER, displayName: "Other", avatarUrl: null } })],
      resolutions: new Map([[FIRST_ID, RESOLVED]]),
      positions: new Map([[FIRST_ID, measurement(100, 200)]]),
      activeThreadId: FIRST_ID,
    });

    expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
  });

  it("keeps the status toggle for a guest on their own thread", () => {
    setup({
      site: { ...SITE, role: "guest" },
      threads: [thread(FIRST_ID)],
      resolutions: new Map([[FIRST_ID, RESOLVED]]),
      positions: new Map([[FIRST_ID, measurement(100, 200)]]),
      activeThreadId: FIRST_ID,
    });

    expect(screen.getByRole("button", { name: "Resolve" })).toBeTruthy();
  });

  it("opens an orphaned thread next to the sidebar", () => {
    setup({
      sidebarOpen: true,
      threads: [thread(FIRST_ID)],
      resolutions: new Map([[FIRST_ID, ORPHANED]]),
      activeThreadId: FIRST_ID,
    });

    expect(screen.getByRole("dialog", { name: "Thread 1" })).toBeTruthy();
  });

  it("closes the panel", async () => {
    const user = userEvent.setup();
    const { actions } = setup({
      threads: [thread(FIRST_ID)],
      resolutions: new Map([[FIRST_ID, RESOLVED]]),
      activeThreadId: FIRST_ID,
    });

    await user.click(screen.getByRole("button", { name: "Close thread" }));

    expect(actions.closePanel).toHaveBeenCalledTimes(1);
  });

  it("renders page-provided text as text", () => {
    setup({
      threads: [
        thread(FIRST_ID, {
          comments: [comment(FIRST_ID, { body: '<img src=x onerror="alert(1)">' })],
        }),
      ],
      resolutions: new Map([[FIRST_ID, RESOLVED]]),
      activeThreadId: FIRST_ID,
    });

    const dialog = screen.getByRole("dialog", { name: "Thread 1" });

    expect(within(dialog).getByText('<img src=x onerror="alert(1)">')).toBeTruthy();
    expect(dialog.querySelector("img")).toBeNull();
  });
});

describe("off-page comment card", () => {
  it("toggles the status of the thread from the card", async () => {
    const user = userEvent.setup();
    const { actions } = setup({
      siteThreads: [thread(SECOND_ID, { pageUrl: "https://example.test/other" })],
      offPageThreadId: SECOND_ID,
    });

    await user.click(screen.getByRole("button", { name: "Resolve" }));

    expect(actions.toggleStatus).toHaveBeenCalledWith(SECOND_ID);
  });

  it("offers to reopen a resolved off-page thread", () => {
    setup({
      siteThreads: [
        thread(SECOND_ID, { pageUrl: "https://example.test/other", status: "resolved" }),
      ],
      offPageThreadId: SECOND_ID,
    });

    expect(screen.getByRole("button", { name: "Reopen" })).toBeTruthy();
  });

  it("shows every comment of an off-page thread, not only the excerpt", () => {
    const reply = comment(SECOND_ID, {
      id: "40000000-0000-4000-8000-000000000099",
      author: { id: OTHER, displayName: "Other", avatarUrl: null },
      body: "A reply from another member",
      createdAt: "2026-10-21T12:00:00.000Z",
    });
    setup({
      siteThreads: [
        thread(SECOND_ID, {
          pageUrl: "https://example.test/other",
          comments: [comment(SECOND_ID, { body: "The opening comment" }), reply],
        }),
      ],
      offPageThreadId: SECOND_ID,
    });

    const card = screen.getByRole("dialog", { name: "Comment on another page" });

    expect(within(card).getByText("The opening comment")).toBeTruthy();
    expect(within(card).getByText("A reply from another member")).toBeTruthy();
    expect(within(card).getByRole("region", { name: "Page context" })).toBeTruthy();
    expect(within(card).queryByRole("button", { name: "Edit" })).toBeNull();
  });
});

describe("toasts", () => {
  it("renders toasts and dismisses them through the controller", async () => {
    const user = userEvent.setup();
    const { actions } = setup({
      toasts: [{ id: "toast-1", message: "That did not work", variant: "error" }],
    });

    expect(screen.getByText("That did not work")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Dismiss notification" }));

    expect(actions.dismissToast).toHaveBeenCalledWith("toast-1");
  });
});

describe("comment stacking", () => {
  it("raises the active panel and the pin layer above a z-indexed anchor", () => {
    const header = document.createElement("header");
    header.style.zIndex = "2147483100";
    const heading = document.createElement("h2");
    header.append(heading);
    document.body.append(header);
    const target = { kind: "element" as const, element: heading, offset: { x: 0.5, y: 0.5 } };
    try {
      setup({
        threads: [thread(FIRST_ID)],
        resolutions: new Map<string, Resolution>([[FIRST_ID, { status: "resolved", target }]]),
        positions: new Map([[FIRST_ID, measurement(100, 200)]]),
        activeThreadId: FIRST_ID,
      });

      expect(screen.getByRole("dialog").style.zIndex).toBe("2147483101");
      expect(screen.getByRole("group", { name: "Comment pins" }).style.zIndex).toBe("2147483101");
    } finally {
      header.remove();
    }
  });

  it("keeps the default panel stacking when the anchor is below it", () => {
    setup({
      threads: [thread(FIRST_ID)],
      resolutions: new Map([[FIRST_ID, RESOLVED]]),
      positions: new Map([[FIRST_ID, measurement(100, 200)]]),
      activeThreadId: FIRST_ID,
    });

    expect(screen.getByRole("dialog").style.zIndex).toBe(String(Z_INDEX.panel));
    expect(screen.getByRole("group", { name: "Comment pins" }).style.zIndex).toBe(
      String(Z_INDEX.pins),
    );
  });
});
