import {
  SITENOTE_ROOT_TAG,
  createElementAnchor,
  createTextAnchor,
  parsePageUrl,
  parseThreadHash,
  type Anchor,
  type ThreadContext,
} from "@sitenote/core";
import type { AnchorRect, ComposerSubmission, ScreenshotState, ToastView } from "@sitenote/ui";

import {
  ORPHANED,
  isTargetAlive,
  observableElement,
  resolveAnchor,
  type AnchorTarget,
  type Resolution,
} from "../anchor-target";
import { createPicker } from "../comment-picker";
import { createDocumentStyle } from "../document-style";
import { watchDom } from "../dom-watcher";
import { ERROR_MESSAGES } from "../messages";
import { createPageSession, type PageSessionDeps, type PageSessionState } from "../page-session";
import type { PageSessionStatus } from "../page-session";
import { createPinTracker, type Measurements, type TrackedTarget } from "../pin-tracker";
import type { ResolvedPreference } from "../resolved-preference";
import type { ScreenshotTaker } from "../screenshot-taker";
import { watchSelection } from "../selection-watcher";
import { createStore, type Store } from "../store";
import { createTextHighlighter } from "../text-highlighter";
import type { MemberRecord, SiteInfo, ThreadRecord } from "../transport";
import { watchPageUrl } from "../url-watcher";
import { upsertComment, upsertThread } from "../view-model";

export const PENDING_ID = "pending";
export const SELECTION_ID = "selection";
export const MAX_TOASTS = 3;
export const UNSUPPORTED_SELECTION_MESSAGE = "That selection cannot be commented on.";
export const PREFERENCE_FAILED_MESSAGE = "Could not remember this setting for the next visit.";
export const SCREENSHOT_FAILED_MESSAGE = "Screenshot could not be saved";
export const THREAD_NOT_HERE_MESSAGE = "This comment is on another page or you do not have access.";
export const COMMENT_CURSOR_CSS = `html, html * { cursor: crosshair !important; } ${SITENOTE_ROOT_TAG} { cursor: auto !important; }`;

export interface PendingThread {
  anchor: Anchor;
  target: AnchorTarget;
  captureId: string | null;
}

export interface ContentState {
  status: PageSessionStatus;
  site: SiteInfo | null;
  live: boolean;
  threads: ThreadRecord[];
  members: MemberRecord[];
  screenshots: ReadonlyMap<string, ScreenshotState>;
  resolutions: ReadonlyMap<string, Resolution>;
  positions: Measurements;
  commentMode: boolean;
  hover: AnchorRect | null;
  activeThreadId: string | null;
  pending: PendingThread | null;
  selection: Range | null;
  sidebarOpen: boolean;
  showResolved: boolean;
  toasts: ToastView[];
  panelError: string | undefined;
  fallbackHighlights: boolean;
}

export interface ContentControllerDeps {
  win: Window;
  doc: Document;
  origin: string;
  isOwn: (node: Node | null) => boolean;
  send: PageSessionDeps["send"];
  openConnection: PageSessionDeps["openConnection"];
  preference: ResolvedPreference;
  screenshot: ScreenshotTaker;
  collectContext: () => Promise<ThreadContext>;
}

export interface ContentController {
  store: Store<ContentState>;
  start: () => Promise<void>;
  stop: () => void;
  toggleCommentMode: () => boolean;
  exitCommentMode: () => void;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  setShowResolved: (show: boolean) => void;
  selectThread: (threadId: string) => void;
  togglePin: (threadId: string) => void;
  closePanel: () => void;
  startTextComment: () => void;
  submitNewThread: (submission: ComposerSubmission) => Promise<void>;
  reply: (threadId: string, submission: ComposerSubmission) => Promise<void>;
  editComment: (commentId: string, body: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  toggleStatus: (threadId: string) => Promise<void>;
  dismissToast: (toastId: string) => void;
}

export function reconcileResolutions(
  previous: ReadonlyMap<string, Resolution>,
  threads: readonly ThreadRecord[],
  doc: Document,
): ReadonlyMap<string, Resolution> {
  const next = new Map<string, Resolution>();
  let changed = previous.size !== threads.length;
  for (const thread of threads) {
    const existing = previous.get(thread.id);
    if (existing?.status === "resolved" && isTargetAlive(existing.target)) {
      next.set(thread.id, existing);
      continue;
    }
    const fresh = thread.anchor === null ? ORPHANED : resolveAnchor(thread.anchor, doc);
    next.set(thread.id, fresh);
    if (existing !== fresh) {
      changed = true;
    }
  }
  return changed ? next : previous;
}

function scrollTargetIntoView(target: AnchorTarget, behavior: ScrollBehavior = "auto"): void {
  observableElement(target)?.scrollIntoView({ block: "center", inline: "nearest", behavior });
}

export function createContentController(deps: ContentControllerDeps): ContentController {
  const { win, doc } = deps;
  const readPageUrl = (): string | null => parsePageUrl(win.location.href)?.page ?? null;
  const highlighter = createTextHighlighter(doc);
  const cursorStyle = createDocumentStyle(doc, COMMENT_CURSOR_CSS);
  const store = createStore<ContentState>({
    status: "starting",
    site: null,
    live: false,
    threads: [],
    members: [],
    screenshots: new Map(),
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
    fallbackHighlights: !highlighter.supported,
  });

  let sessionThreads: ThreadRecord[] | null = null;
  let loadedSiteId: string | null = null;
  let showResolvedChosen = false;
  let toastCounter = 0;
  let creating = false;
  let capturing = false;
  let pageLoaded = false;
  let deactivate: (() => void) | null = null;

  const tracker = createPinTracker({
    win,
    onMeasure: (positions) => {
      store.setState((state) => ({ ...state, positions }));
    },
  });

  const picker = createPicker({
    doc,
    win,
    isOwn: deps.isOwn,
    onHover: (hover) => {
      store.setState((state) => ({ ...state, hover: hover === null ? null : hover.rect }));
    },
    onPick: (element, point) => {
      const anchor = createElementAnchor(element, point);
      void beginCaptured({
        anchor,
        target: { kind: "element", element, offset: anchor.offset },
      });
    },
  });

  function pushToast(toast: Omit<ToastView, "id">): void {
    toastCounter += 1;
    const view: ToastView = { id: `toast-${String(toastCounter)}`, ...toast };
    store.setState((state) => ({
      ...state,
      toasts: [...state.toasts, view].slice(-MAX_TOASTS),
    }));
  }

  function dismissToast(toastId: string): void {
    store.setState((state) => ({
      ...state,
      toasts: state.toasts.filter((toast) => toast.id !== toastId),
    }));
  }

  function applyThreads(threads: ThreadRecord[]): void {
    store.setState((state) => ({
      ...state,
      threads,
      resolutions: reconcileResolutions(state.resolutions, threads, doc),
      activeThreadId: threads.some((thread) => thread.id === state.activeThreadId)
        ? state.activeThreadId
        : null,
    }));
  }

  function reresolve(): void {
    store.setState((state) => {
      const resolutions = reconcileResolutions(state.resolutions, state.threads, doc);
      return resolutions === state.resolutions ? state : { ...state, resolutions };
    });
  }

  function syncTargets(state: ContentState): void {
    const targets: TrackedTarget[] = [];
    const ranges: Range[] = [];
    for (const thread of state.threads) {
      const resolution = state.resolutions.get(thread.id);
      const isActive = thread.id === state.activeThreadId;
      const hidden = thread.status === "resolved" && !isActive && !state.showResolved;
      if (resolution?.status !== "resolved" || hidden) {
        continue;
      }
      targets.push({ id: thread.id, target: resolution.target, always: isActive });
      if (resolution.target.kind === "text") {
        ranges.push(resolution.target.range);
      }
    }
    if (state.pending !== null) {
      targets.push({ id: PENDING_ID, target: state.pending.target, always: true });
      if (state.pending.target.kind === "text") {
        ranges.push(state.pending.target.range);
      }
    }
    if (state.selection !== null) {
      targets.push({
        id: SELECTION_ID,
        target: { kind: "text", range: state.selection },
        always: true,
      });
    }
    tracker.setTargets(targets);
    highlighter.set(ranges);
  }

  function handlePageChange(): void {
    store.setState((state) => ({
      ...state,
      threads: [],
      resolutions: new Map(),
      activeThreadId: null,
      pending: null,
      selection: null,
      panelError: undefined,
    }));
    session.navigate();
  }

  function setCommentMode(on: boolean): void {
    if (on) {
      picker.enable();
      cursorStyle.attach();
    } else {
      picker.disable();
      cursorStyle.detach();
    }
    store.setState((state) =>
      state.commentMode === on
        ? state
        : { ...state, commentMode: on, hover: on ? state.hover : null },
    );
  }

  async function loadMembers(): Promise<void> {
    const site = store.getState().site;
    if (site === null) {
      return;
    }
    const result = await deps.send({ type: "members.list", workspaceId: site.workspaceId });
    if (!result.ok) {
      return;
    }
    const members = result.data;
    store.setState((state) =>
      JSON.stringify(state.members) === JSON.stringify(members) ? state : { ...state, members },
    );
  }

  async function loadShowResolved(siteId: string): Promise<void> {
    const show = await deps.preference.load(siteId);
    if (!showResolvedChosen && store.getState().site?.siteId === siteId) {
      store.setState((state) =>
        state.showResolved === show ? state : { ...state, showResolved: show },
      );
    }
  }

  function setShowResolved(show: boolean): void {
    showResolvedChosen = true;
    if (store.getState().showResolved === show) {
      return;
    }
    store.setState((state) => ({ ...state, showResolved: show }));
    const site = store.getState().site;
    if (site !== null) {
      deps.preference.save(site.siteId, show).catch(() => {
        pushToast({ message: PREFERENCE_FAILED_MESSAGE, variant: "info" });
      });
    }
  }

  async function beginCaptured(base: Omit<PendingThread, "captureId">): Promise<void> {
    if (capturing) {
      return;
    }
    capturing = true;
    const pageUrl = readPageUrl();
    try {
      const captureId = await deps.screenshot.take(base.target).catch(() => null);
      if (readPageUrl() !== pageUrl) {
        return;
      }
      if (base.target.kind === "text") {
        doc.getSelection()?.removeAllRanges();
      }
      beginPending({ ...base, captureId });
    } finally {
      capturing = false;
    }
  }

  async function loadScreenshot(threadId: string): Promise<void> {
    const thread = store.getState().threads.find((candidate) => candidate.id === threadId);
    if (thread?.hasScreenshot !== true) {
      return;
    }
    const setScreenshot = (value: ScreenshotState): void => {
      store.setState((state) => ({
        ...state,
        screenshots: new Map(state.screenshots).set(threadId, value),
      }));
    };
    if (!store.getState().screenshots.has(threadId)) {
      setScreenshot({ status: "loading" });
    }
    const result = await deps.send({ type: "threads.screenshotUrl", threadId });
    setScreenshot(
      result.ok && result.data !== null
        ? { status: "ready", url: result.data }
        : { status: "unavailable" },
    );
  }

  function beginPending(pending: PendingThread): void {
    void loadMembers();
    store.setState((state) => ({
      ...state,
      pending,
      activeThreadId: null,
      selection: null,
      panelError: undefined,
    }));
  }

  function closePanel(): void {
    store.setState((state) =>
      state.pending === null && state.activeThreadId === null
        ? state
        : { ...state, pending: null, activeThreadId: null, panelError: undefined },
    );
  }

  function selectThread(threadId: string): void {
    const state = store.getState();
    if (!state.threads.some((thread) => thread.id === threadId)) {
      return;
    }
    void loadMembers();
    const resolution = state.resolutions.get(threadId);
    if (resolution?.status === "resolved" && state.positions.get(threadId)?.visible !== true) {
      scrollTargetIntoView(resolution.target);
    }
    store.setState((current) => ({
      ...current,
      activeThreadId: threadId,
      pending: null,
      panelError: undefined,
    }));
  }

  function prefersReducedMotion(): boolean {
    return win.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function clearThreadHash(): void {
    const url = new URL(win.location.href);
    url.hash = "";
    win.history.replaceState(win.history.state, "", url.href);
  }

  function openThreadFromHash(): void {
    const threadId = parseThreadHash(win.location.hash);
    const state = store.getState();
    if (threadId === null || !pageLoaded || state.status !== "ready") {
      return;
    }
    clearThreadHash();
    if (!state.threads.some((thread) => thread.id === threadId)) {
      pushToast({ message: THREAD_NOT_HERE_MESSAGE, variant: "info" });
      return;
    }
    const resolution = state.resolutions.get(threadId);
    if (resolution?.status === "resolved") {
      scrollTargetIntoView(resolution.target, prefersReducedMotion() ? "auto" : "smooth");
    }
    void loadMembers();
    store.setState((current) => ({
      ...current,
      activeThreadId: threadId,
      pending: null,
      panelError: undefined,
      sidebarOpen: current.sidebarOpen || resolution?.status !== "resolved",
    }));
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (
      event.key !== "Escape" ||
      event.defaultPrevented ||
      deps.isOwn(event.target as Node | null)
    ) {
      return;
    }
    const state = store.getState();
    if (state.pending !== null) {
      closePanel();
    } else if (state.commentMode) {
      setCommentMode(false);
    } else {
      return;
    }
    event.stopImmediatePropagation();
  }

  function activate(): void {
    if (deactivate !== null) {
      return;
    }
    const urlWatcher = watchPageUrl({ win, readPageUrl, onChange: handlePageChange });
    const stopDom = watchDom({
      root: doc.body,
      isOwn: (node) => deps.isOwn(node),
      onSettled: () => {
        urlWatcher.check();
        reresolve();
        tracker.invalidate();
      },
    });
    const stopSelection = watchSelection({
      doc,
      isOwn: deps.isOwn,
      onChange: (selection) => {
        store.setState((state) => ({ ...state, selection }));
      },
    });
    let seen = store.getState();
    const unsubscribe = store.subscribe(() => {
      const state = store.getState();
      const previous = seen;
      seen = state;
      if (
        state.threads !== previous.threads ||
        state.resolutions !== previous.resolutions ||
        state.activeThreadId !== previous.activeThreadId ||
        state.pending !== previous.pending ||
        state.selection !== previous.selection ||
        state.showResolved !== previous.showResolved
      ) {
        syncTargets(state);
      }
      if (state.activeThreadId !== previous.activeThreadId && state.activeThreadId !== null) {
        void loadScreenshot(state.activeThreadId);
      }
    });
    win.addEventListener("keydown", handleKeyDown, true);
    win.addEventListener("hashchange", openThreadFromHash);
    syncTargets(seen);
    deactivate = () => {
      win.removeEventListener("keydown", handleKeyDown, true);
      win.removeEventListener("hashchange", openThreadFromHash);
      unsubscribe();
      stopSelection();
      stopDom();
      urlWatcher.stop();
      tracker.stop();
      highlighter.set([]);
      deactivate = null;
    };
  }

  function handleSession(next: PageSessionState): void {
    store.setState((state) => ({
      ...state,
      status: next.status,
      site: next.site,
      live: next.live,
    }));
    if (next.threads !== sessionThreads) {
      sessionThreads = next.threads;
      applyThreads(next.threads);
    }
    if (next.site !== null && next.site.siteId !== loadedSiteId) {
      loadedSiteId = next.site.siteId;
      void loadMembers();
      void loadShowResolved(next.site.siteId);
    }
    pageLoaded = next.loaded;
    if (next.status === "ready") {
      activate();
      openThreadFromHash();
    } else if (next.status === "disabled") {
      shutdown();
    }
  }

  function shutdown(): void {
    deactivate?.();
    picker.disable();
    cursorStyle.detach();
    tracker.stop();
    highlighter.dispose();
    session.stop();
  }

  const session = createPageSession({
    origin: deps.origin,
    readPageUrl,
    send: deps.send,
    openConnection: deps.openConnection,
    onState: handleSession,
  });

  async function submitNewThread(submission: ComposerSubmission): Promise<void> {
    const { pending, site } = store.getState();
    const pageUrl = readPageUrl();
    if (pending === null || site === null || pageUrl === null || creating) {
      throw new Error(ERROR_MESSAGES.page_unavailable);
    }
    creating = true;
    store.setState((state) => ({ ...state, panelError: undefined }));
    try {
      const context = await deps.collectContext();
      const result = await deps.send({
        type: "threads.create",
        siteId: site.siteId,
        pageUrl,
        anchor: pending.anchor,
        context,
        ...(pending.captureId === null ? {} : { captureId: pending.captureId }),
        body: submission.body,
        mentions: submission.mentions,
      });
      if (!result.ok) {
        const message = result.error.message;
        store.setState((state) => ({ ...state, panelError: message }));
        pushToast({
          message,
          variant: "error",
          onRetry: () => {
            submitNewThread(submission).catch(() => undefined);
          },
        });
        throw new Error(message);
      }
      const record = result.data;
      if (!record.hasScreenshot) {
        pushToast({ message: SCREENSHOT_FAILED_MESSAGE, variant: "info" });
      }
      if (readPageUrl() !== record.pageUrl) {
        return;
      }
      store.setState((state) => {
        const stillPending = state.pending === pending;
        const resolutions = new Map(state.resolutions);
        resolutions.set(record.id, { status: "resolved", target: pending.target });
        return {
          ...state,
          threads: upsertThread(state.threads, record),
          resolutions,
          pending: stillPending ? null : state.pending,
          activeThreadId: stillPending ? record.id : state.activeThreadId,
          panelError: undefined,
        };
      });
    } finally {
      creating = false;
    }
  }

  async function reply(threadId: string, submission: ComposerSubmission): Promise<void> {
    store.setState((state) => ({ ...state, panelError: undefined }));
    const result = await deps.send({
      type: "comments.create",
      threadId,
      body: submission.body,
      mentions: submission.mentions,
    });
    if (!result.ok) {
      const message = result.error.message;
      store.setState((state) => ({ ...state, panelError: message }));
      throw new Error(message);
    }
    const comment = result.data;
    store.setState((state) => ({ ...state, threads: upsertComment(state.threads, comment) }));
  }

  async function editComment(commentId: string, body: string): Promise<void> {
    const result = await deps.send({ type: "comments.update", commentId, body });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    const comment = result.data;
    store.setState((state) => ({ ...state, threads: upsertComment(state.threads, comment) }));
  }

  async function deleteComment(commentId: string): Promise<void> {
    const result = await deps.send({ type: "comments.delete", commentId });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    const comment = result.data;
    store.setState((state) => ({ ...state, threads: upsertComment(state.threads, comment) }));
  }

  async function toggleStatus(threadId: string): Promise<void> {
    const thread = store.getState().threads.find((candidate) => candidate.id === threadId);
    if (thread === undefined) {
      return;
    }
    const result = await deps.send({
      type: "threads.setStatus",
      threadId,
      status: thread.status === "open" ? "resolved" : "open",
    });
    if (!result.ok) {
      pushToast({
        message: result.error.message,
        variant: "error",
        onRetry: () => {
          void toggleStatus(threadId);
        },
      });
      return;
    }
    const record = result.data;
    store.setState((state) => ({ ...state, threads: upsertThread(state.threads, record) }));
  }

  return {
    store,
    start: () => session.start(),
    stop: shutdown,
    toggleCommentMode: () => {
      const next = !store.getState().commentMode;
      setCommentMode(next);
      return next;
    },
    exitCommentMode: () => {
      setCommentMode(false);
    },
    toggleSidebar: () => {
      store.setState((state) => ({ ...state, sidebarOpen: !state.sidebarOpen }));
    },
    closeSidebar: () => {
      store.setState((state) => (state.sidebarOpen ? { ...state, sidebarOpen: false } : state));
    },
    setShowResolved,
    selectThread,
    togglePin: (threadId) => {
      if (threadId === PENDING_ID) {
        return;
      }
      if (store.getState().activeThreadId === threadId) {
        closePanel();
      } else {
        selectThread(threadId);
      }
    },
    closePanel,
    startTextComment: () => {
      const range = store.getState().selection;
      if (range === null) {
        return;
      }
      const anchor = createTextAnchor(range, doc);
      if (anchor === null) {
        doc.getSelection()?.removeAllRanges();
        store.setState((state) => ({ ...state, selection: null }));
        pushToast({ message: UNSUPPORTED_SELECTION_MESSAGE, variant: "info" });
        return;
      }
      void beginCaptured({ anchor, target: { kind: "text", range } });
    },
    submitNewThread,
    reply,
    editComment,
    deleteComment,
    toggleStatus,
    dismissToast,
  };
}
