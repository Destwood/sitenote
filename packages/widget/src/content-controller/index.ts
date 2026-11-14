import {
  SITENOTE_ROOT_TAG,
  appendThreadHash,
  createElementAnchor,
  createTextAnchor,
  isRecordedAction,
  parsePageUrl,
  parseReplayMode,
  parseThreadHash,
  type Anchor,
  type RecordingStep,
  type ReplaySource,
  type ReplayMode,
} from "@sitenote/core";
import {
  DEFAULT_SELECTION_PLACEMENT,
  type AnchorRect,
  type ComposerSubmission,
  type ScreenshotState,
  type SelectionPlacement,
  type ShareAccess,
  type ToastView,
} from "@sitenote/ui";

import {
  type AnchorTarget,
  isTargetAlive,
  observableElement,
  ORPHANED,
  type Resolution,
  resolveAnchor,
} from "../anchor-target";
import { createDocumentStyle } from "../document-style";
import { createPicker, type PickPoint } from "../comment-picker";
import { createPinTracker, type Measurements, type TrackedTarget } from "../pin-tracker";
import { createStore, type Store } from "../store";
import { createTextHighlighter } from "../text-highlighter";
import { ERROR_MESSAGES, type MessageResult } from "../result";
import { upsertComment, upsertThread } from "../view-model";
import { watchDom } from "../dom-watcher";
import { watchPageUrl } from "../url-watcher";
import { watchSelection } from "../selection-watcher";
import type {
  CommentRecord,
  MemberRecord,
  SiteInfo,
  ThreadRecord,
  ThreadShareInfo,
} from "../transport";

import type { WidgetBackend } from "../backend";
import { createPageSession, type PageSessionState, type PageSessionStatus } from "../page-session";
import type { PreferenceClient } from "../preference-client";
import type { ScreenshotTaker } from "../screenshot-taker";
import { createReplayRunner, type ReplayRunner, type ReplayView } from "../replay-runner";
export const PENDING_ID = "pending";
export const SELECTION_ID = "selection";
export const MAX_TOASTS = 3;
export const UNSUPPORTED_SELECTION_MESSAGE = "That selection cannot be commented on.";
export const CLICKUP_SCREENSHOT_MISSING_MESSAGE =
  "The ClickUp task was created without the screenshot.";
export const JIRA_LINK_MISSING_MESSAGE =
  "The issue was linked, but the link could not be added to the Jira issue.";
export const PREFERENCE_FAILED_MESSAGE = "Could not remember this setting for the next visit.";
export const SCREENSHOT_FAILED_MESSAGE = "Screenshot could not be saved";
export const RECORDING_ATTACHED_MESSAGE = "Video attached to your next comment";
export const THREAD_NOT_HERE_MESSAGE = "This comment is on another page or you do not have access.";
const OPEN_START_PAGE_MESSAGE = "Opening the page where the recording started.";
const NO_RECORDED_STEPS_MESSAGE = "This comment has no recorded steps.";
const ROUTE_COPIED_MESSAGE = "Route copied";
const ROUTE_COPY_FAILED_MESSAGE = "Could not copy the route";
export const COMMENT_CURSOR_CSS = `html, html * { cursor: crosshair !important; } ${SITENOTE_ROOT_TAG} { cursor: auto !important; }`;
const REPLAY_POINTER_EVENTS = [
  "pointerdown",
  "pointerup",
  "mousedown",
  "mouseup",
  "click",
  "auxclick",
  "dblclick",
  "contextmenu",
] as const;

export interface PendingThread {
  anchor: Anchor;
  target: AnchorTarget;
  captureId: string | null;
}

export interface ReplayState {
  view: Omit<ReplayView, "target">;
  highlight: AnchorRect | null;
}

export interface ReplayGateState {
  threadId: string;
  mode: ReplayMode;
  steps: RecordingStep[];
  startUrl: string | null;
}

interface ReplayRequest {
  threadId: string;
  steps: RecordingStep[];
  mode: ReplayMode;
  startUrl: string | null;
  startsSignedOut: boolean;
}

export interface ContentState {
  status: PageSessionStatus;
  site: SiteInfo | null;
  live: boolean;
  threads: ThreadRecord[];
  siteThreads: ThreadRecord[];
  members: MemberRecord[];
  screenshots: ReadonlyMap<string, ScreenshotState>;
  recordings: ReadonlyMap<string, ScreenshotState>;
  recordingAttached: boolean;
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
  clickUpConfigured: boolean;
  clickUpPending: ReadonlySet<string>;
  jiraConfigured: boolean;
  jiraPending: ReadonlySet<string>;
  shares: ReadonlyMap<string, ThreadShareInfo | null>;
  sharePending: ReadonlySet<string>;
  selectionPlacement: SelectionPlacement;
  replayAvailable: boolean;
  replay: ReplayState | null;
  replayGate: ReplayGateState | null;
  offPageThreadId: string | null;
}

export interface ContentControllerDeps {
  win: Window;
  doc: Document;
  origin: string;
  webUrl: string;
  isOwn: (node: Node | null) => boolean;
  backend: WidgetBackend;
  preference: PreferenceClient;
  screenshot: ScreenshotTaker;
}

export interface ContentController {
  store: Store<ContentState>;
  start: () => Promise<void>;
  stop: () => void;
  toggleCommentMode: () => boolean;
  exitCommentMode: () => void;
  enterCommentMode: (notice: string) => boolean;
  attachRecording: () => boolean;
  commentOnContextTarget: () => boolean;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  setShowResolved: (show: boolean) => void;
  selectThread: (threadId: string) => void;
  openThread: (threadId: string) => boolean;
  togglePin: (threadId: string) => void;
  closePanel: () => void;
  startTextComment: () => void;
  submitNewThread: (submission: ComposerSubmission) => Promise<void>;
  reply: (threadId: string, submission: ComposerSubmission) => Promise<void>;
  editComment: (commentId: string, body: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  toggleStatus: (threadId: string) => Promise<void>;
  createClickUpTask: (threadId: string) => Promise<void>;
  linkJiraIssue: (threadId: string, issueKey: string) => Promise<void>;
  setShareAccess: (threadId: string, access: ShareAccess) => Promise<void>;
  copyThreadLink: (threadId: string) => Promise<boolean>;
  dismissToast: (toastId: string) => void;
  startReplay: (threadId: string, mode: ReplayMode) => void;
  gateRun: () => void;
  gateClose: () => void;
  closeOffPage: () => void;
  openOffPagePage: (threadId: string) => void;
  reproduceOffPage: (threadId: string, mode: ReplayMode) => void;
  copyRoute: (route: string) => void;
  replayNext: () => void;
  replayBack: () => void;
  replayPause: () => void;
  replayResume: () => void;
  replaySkip: () => void;
  replayRetry: () => void;
  replayStop: () => void;
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
    if (
      existing?.status === "resolved" &&
      isTargetAlive(existing.target) &&
      (thread.anchor?.kind !== "text" ||
        (existing.target.kind === "text" &&
          existing.target.range.toString().trim() === thread.anchor.quote.exact))
    ) {
      next.set(thread.id, existing);
      continue;
    }
    let fresh = thread.anchor === null ? ORPHANED : resolveAnchor(thread.anchor, doc);
    if (
      existing?.status === "resolved" &&
      existing.target.kind === "element" &&
      fresh.status === "resolved" &&
      fresh.target.kind === "element" &&
      existing.target.element === fresh.target.element
    ) {
      fresh = existing;
    }
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
    fallbackHighlights: !highlighter.supported,
    clickUpConfigured: false,
    clickUpPending: new Set<string>(),
    jiraConfigured: false,
    jiraPending: new Set<string>(),
    shares: new Map(),
    sharePending: new Set<string>(),
    selectionPlacement: DEFAULT_SELECTION_PLACEMENT,
    replayAvailable: deps.backend.replayProgress !== undefined,
    replay: null,
    replayGate: null,
    offPageThreadId: null,
  });

  let sessionThreads: ThreadRecord[] | null = null;
  let loadedSiteId: string | null = null;
  let showResolvedChosen = false;
  let toastCounter = 0;
  let creating = false;
  let capturing = false;
  let pageLoaded = false;
  let deactivate: (() => void) | null = null;
  let contextTarget: { element: Element; point: PickPoint } | null = null;
  let replayTarget: Element | null = null;

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
      setCommentMode(false);
      beginOnElement(element, point);
    },
  });

  function replayRect(): AnchorRect | null {
    if (replayTarget === null) {
      return null;
    }
    const { x, y, width, height } = replayTarget.getBoundingClientRect();
    return { x, y, width, height };
  }

  function refreshReplayHighlight(): void {
    const highlight = replayRect();
    store.setState((state) =>
      state.replay === null ? state : { ...state, replay: { ...state.replay, highlight } },
    );
  }

  function setReplayTarget(target: Element | null): void {
    if (replayTarget !== null) {
      win.removeEventListener("scroll", refreshReplayHighlight, true);
      win.removeEventListener("resize", refreshReplayHighlight);
    }
    replayTarget = target;
    if (target !== null) {
      win.addEventListener("scroll", refreshReplayHighlight, { capture: true, passive: true });
      win.addEventListener("resize", refreshReplayHighlight);
    }
  }

  function handleReplayChange(view: ReplayView | null): void {
    setReplayTarget(view?.target ?? null);
    if (view === null) {
      store.setState((state) => ({ ...state, replay: null }));
      return;
    }
    const replayView: Omit<ReplayView, "target"> = {
      mode: view.mode,
      index: view.index,
      total: view.total,
      status: view.status,
      label: view.label,
      ...(view.message === undefined ? {} : { message: view.message }),
    };
    store.setState((state) => ({
      ...state,
      replay: { view: replayView, highlight: replayRect() },
    }));
  }

  const replayRunner: ReplayRunner | null =
    deps.backend.replayProgress === undefined
      ? null
      : createReplayRunner({
          doc,
          win,
          store: deps.backend.replayProgress,
          now: () => Date.now(),
          onChange: handleReplayChange,
        });

  function startReplay(threadId: string, mode: ReplayMode): void {
    const recording = store.getState().threads.find((thread) => thread.id === threadId)
      ?.context?.recording;
    const steps = recording?.steps;
    if (replayRunner === null || steps?.some(isRecordedAction) !== true) {
      return;
    }
    const startUrl = recording?.startUrl;
    if (startUrl !== undefined && parsePageUrl(startUrl)?.page !== readPageUrl()) {
      const url = appendThreadHash(startUrl, threadId, mode);
      if (url !== null) {
        win.open(url, "_blank", "noopener");
        pushToast({ message: OPEN_START_PAGE_MESSAGE, variant: "info" });
      }
      return;
    }
    beginReplay({
      threadId,
      steps,
      mode,
      startUrl: startUrl ?? null,
      startsSignedOut: recording?.startsSignedOut === true,
    });
  }

  function beginReplay(request: ReplayRequest): void {
    const { threadId, steps, mode, startUrl, startsSignedOut } = request;
    setCommentMode(false);
    closePanel();
    if (startsSignedOut) {
      store.setState((state) => ({
        ...state,
        replayGate: { threadId, mode, steps, startUrl },
      }));
      return;
    }
    replayRunner?.start(threadId, steps, mode);
  }

  function runReplayGate(): void {
    const gate = store.getState().replayGate;
    if (gate === null) {
      return;
    }
    store.setState((state) => ({ ...state, replayGate: null }));
    replayRunner?.start(gate.threadId, gate.steps, gate.mode);
  }

  function closeOffPage(): void {
    store.setState((state) => ({ ...state, offPageThreadId: null }));
  }

  function openOffPagePage(threadId: string): void {
    const thread = store.getState().siteThreads.find((candidate) => candidate.id === threadId);
    const href = thread === undefined ? null : appendThreadHash(thread.pageUrl, thread.id);
    if (href !== null) {
      win.location.assign(href);
    }
  }

  async function replayOffPage(threadId: string, mode: ReplayMode): Promise<void> {
    const getReplaySource = deps.backend.getReplaySource;
    const result =
      getReplaySource === undefined ? null : await getReplaySource(threadId).catch(() => null);
    const source = result?.ok === true ? result.data : null;
    closeOffPage();
    if (source?.steps.some(isRecordedAction) !== true) {
      pushToast({ message: NO_RECORDED_STEPS_MESSAGE, variant: "info" });
      return;
    }
    const startPage = source.startUrl ?? source.pageUrl;
    if (parsePageUrl(startPage)?.page !== readPageUrl()) {
      const url = appendThreadHash(startPage, threadId, mode);
      if (url !== null) {
        win.open(url, "_blank", "noopener");
        pushToast({ message: OPEN_START_PAGE_MESSAGE, variant: "info" });
      }
      return;
    }
    beginReplay({
      threadId,
      steps: source.steps,
      mode,
      startUrl: source.startUrl,
      startsSignedOut: source.startsSignedOut,
    });
  }

  function copyRoute(route: string): void {
    void Promise.resolve()
      .then(() => win.navigator.clipboard.writeText(route))
      .then(
        () => {
          pushToast({ message: ROUTE_COPIED_MESSAGE, variant: "info" });
        },
        () => {
          pushToast({ message: ROUTE_COPY_FAILED_MESSAGE, variant: "error" });
        },
      );
  }

  function beginOnElement(element: Element, point: PickPoint): void {
    const anchor = createElementAnchor(element, point);
    void beginCaptured({
      anchor,
      target: { kind: "element", element, offset: anchor.offset },
    });
  }

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

  function exitCommentMode(): void {
    setCommentMode(false);
    store.setState((state) =>
      state.recordingAttached ? { ...state, recordingAttached: false } : state,
    );
  }

  async function loadMembers(): Promise<void> {
    const site = store.getState().site;
    if (site === null) {
      return;
    }
    const result = await deps.backend.listMembers(site.workspaceId);
    if (!result.ok) {
      return;
    }
    const members = result.data;
    store.setState((state) =>
      JSON.stringify(state.members) === JSON.stringify(members) ? state : { ...state, members },
    );
  }

  async function loadClickUpStatus(): Promise<void> {
    const site = store.getState().site;
    if (site === null) {
      return;
    }
    const result = await deps.backend.getClickUpStatus(site.workspaceId);
    if (!result.ok) {
      return;
    }
    const configured = result.data;
    store.setState((state) =>
      state.clickUpConfigured === configured ? state : { ...state, clickUpConfigured: configured },
    );
  }

  async function createClickUpTask(threadId: string): Promise<void> {
    if (store.getState().clickUpPending.has(threadId)) {
      return;
    }
    store.setState((state) => ({
      ...state,
      clickUpPending: new Set(state.clickUpPending).add(threadId),
    }));
    const result = await deps.backend.createClickUpTask(threadId);
    store.setState((state) => {
      const pending = new Set(state.clickUpPending);
      pending.delete(threadId);
      const threads = result.ok
        ? state.threads.map((thread) =>
            thread.id === threadId ? { ...thread, clickUpTaskUrl: result.data.taskUrl } : thread,
          )
        : state.threads;
      return { ...state, clickUpPending: pending, threads };
    });
    if (!result.ok) {
      pushToast({
        message: result.error.message,
        variant: "error",
        onRetry: () => {
          void createClickUpTask(threadId);
        },
      });
      return;
    }
    if (!result.data.screenshotAttached) {
      pushToast({ message: CLICKUP_SCREENSHOT_MISSING_MESSAGE, variant: "info" });
    }
  }

  async function loadJiraStatus(): Promise<void> {
    const site = store.getState().site;
    if (site === null) {
      return;
    }
    const result = await deps.backend.getJiraStatus(site.workspaceId);
    if (!result.ok) {
      return;
    }
    const configured = result.data;
    store.setState((state) =>
      state.jiraConfigured === configured ? state : { ...state, jiraConfigured: configured },
    );
  }

  async function linkJiraIssue(threadId: string, issueKey: string): Promise<void> {
    if (store.getState().jiraPending.has(threadId)) {
      return;
    }
    store.setState((state) => ({
      ...state,
      jiraPending: new Set(state.jiraPending).add(threadId),
    }));
    const result = await deps.backend.linkJiraIssue(threadId, issueKey);
    store.setState((state) => {
      const pending = new Set(state.jiraPending);
      pending.delete(threadId);
      const threads = result.ok
        ? state.threads.map((thread) =>
            thread.id === threadId
              ? {
                  ...thread,
                  jiraIssueKey: result.data.issueKey,
                  jiraIssueUrl: result.data.issueUrl,
                }
              : thread,
          )
        : state.threads;
      return { ...state, jiraPending: pending, threads };
    });
    if (!result.ok) {
      pushToast({
        message: result.error.message,
        variant: "error",
        onRetry: () => {
          void linkJiraIssue(threadId, issueKey);
        },
      });
      return;
    }
    if (!result.data.linkAdded) {
      pushToast({ message: JIRA_LINK_MISSING_MESSAGE, variant: "info" });
    }
  }

  async function loadShare(threadId: string): Promise<void> {
    const result = await deps.backend.getThreadShare(threadId);
    if (!result.ok) {
      return;
    }
    const share = result.data;
    store.setState((state) => ({ ...state, shares: new Map(state.shares).set(threadId, share) }));
  }

  async function setShareAccess(threadId: string, access: ShareAccess): Promise<void> {
    if (store.getState().sharePending.has(threadId)) {
      return;
    }
    store.setState((state) => ({
      ...state,
      sharePending: new Set(state.sharePending).add(threadId),
    }));
    const result = await deps.backend.setThreadShare(threadId, access === "link");
    store.setState((state) => {
      const pending = new Set(state.sharePending);
      pending.delete(threadId);
      return {
        ...state,
        sharePending: pending,
        shares: result.ok ? new Map(state.shares).set(threadId, result.data) : state.shares,
      };
    });
    if (!result.ok) {
      pushToast({
        message: result.error.message,
        variant: "error",
        onRetry: () => {
          void setShareAccess(threadId, access);
        },
      });
    }
  }

  async function copyThreadLink(threadId: string): Promise<boolean> {
    const share = store.getState().shares.get(threadId) ?? null;
    const url = share === null ? `${deps.webUrl}/t/${threadId}` : `${deps.webUrl}/s/${share.token}`;
    try {
      await win.navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }

  async function refreshSelectionPlacement(): Promise<void> {
    if (deps.backend.getSelectionPlacement === undefined) {
      return;
    }
    const result = await deps.backend.getSelectionPlacement();
    if (!result.ok) {
      return;
    }
    const placement = result.data;
    store.setState((state) =>
      state.selectionPlacement === placement ? state : { ...state, selectionPlacement: placement },
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

  async function loadMedia(
    field: "screenshots" | "recordings",
    threadId: string,
    fetchUrl: (id: string) => Promise<MessageResult<string | null>>,
  ): Promise<void> {
    const setMedia = (value: ScreenshotState): void => {
      store.setState((state) => ({
        ...state,
        [field]: new Map(state[field]).set(threadId, value),
      }));
    };
    if (!store.getState()[field].has(threadId)) {
      setMedia({ status: "loading" });
    }
    const result = await fetchUrl(threadId);
    setMedia(
      result.ok && result.data !== null
        ? { status: "ready", url: result.data }
        : { status: "unavailable" },
    );
  }

  async function loadScreenshot(threadId: string): Promise<void> {
    const thread = store.getState().threads.find((candidate) => candidate.id === threadId);
    if (thread?.hasScreenshot !== true) {
      return;
    }
    await loadMedia("screenshots", threadId, (id) => deps.backend.getScreenshotUrl(id));
  }

  async function loadRecording(threadId: string): Promise<void> {
    const thread = store.getState().threads.find((candidate) => candidate.id === threadId);
    const getRecordingUrl = deps.backend.getRecordingUrl;
    if (thread?.context?.recording === undefined || getRecordingUrl === undefined) {
      return;
    }
    await loadMedia("recordings", threadId, (id) => getRecordingUrl(id));
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

  function enterCommentModeWith(notice: string): boolean {
    if (store.getState().status !== "ready") {
      return false;
    }
    setCommentMode(true);
    pushToast({ message: notice, variant: "info" });
    return true;
  }

  function closePanel(): void {
    store.setState((state) =>
      state.pending === null && state.activeThreadId === null
        ? state
        : {
            ...state,
            pending: null,
            activeThreadId: null,
            panelError: undefined,
            recordingAttached: state.pending === null && state.recordingAttached,
          },
    );
  }

  function selectThread(threadId: string): void {
    const state = store.getState();
    if (!state.threads.some((thread) => thread.id === threadId)) {
      return;
    }
    void loadMembers();
    void loadClickUpStatus();
    void loadJiraStatus();
    void loadShare(threadId);
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

  function openThread(threadId: string): boolean {
    if (store.getState().threads.some((thread) => thread.id === threadId)) {
      selectThread(threadId);
      return true;
    }
    if (!store.getState().siteThreads.some((thread) => thread.id === threadId)) {
      return false;
    }
    store.setState((state) => ({ ...state, offPageThreadId: threadId }));
    return true;
  }

  function prefersReducedMotion(): boolean {
    return win.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function clearThreadHash(): void {
    const url = new URL(win.location.href);
    url.hash = "";
    win.history.replaceState(win.history.state, "", url.href);
  }

  async function replayFromSource(
    threadId: string,
    mode: ReplayMode,
    getReplaySource: (id: string) => Promise<MessageResult<ReplaySource | null>>,
  ): Promise<void> {
    const result = await getReplaySource(threadId);
    if (store.getState().status !== "ready") {
      return;
    }
    const source = result.ok ? result.data : null;
    const startKey = source === null ? null : parsePageUrl(source.startUrl ?? source.pageUrl)?.page;
    if (
      source === null ||
      replayRunner === null ||
      !source.steps.some(isRecordedAction) ||
      startKey !== readPageUrl()
    ) {
      pushToast({ message: THREAD_NOT_HERE_MESSAGE, variant: "info" });
      return;
    }
    beginReplay({
      threadId: source.threadId,
      steps: source.steps,
      mode,
      startUrl: source.startUrl,
      startsSignedOut: source.startsSignedOut,
    });
  }

  function openThreadFromHash(): void {
    const threadId = parseThreadHash(win.location.hash);
    const replayMode = parseReplayMode(win.location.hash);
    const state = store.getState();
    if (threadId === null || !pageLoaded || state.status !== "ready") {
      return;
    }
    clearThreadHash();
    if (!state.threads.some((thread) => thread.id === threadId)) {
      if (replayMode !== null && deps.backend.getReplaySource !== undefined) {
        void replayFromSource(threadId, replayMode, deps.backend.getReplaySource);
        return;
      }
      pushToast({ message: THREAD_NOT_HERE_MESSAGE, variant: "info" });
      return;
    }
    const resolution = state.resolutions.get(threadId);
    if (resolution?.status === "resolved") {
      scrollTargetIntoView(resolution.target, prefersReducedMotion() ? "auto" : "smooth");
    }
    void loadMembers();
    void loadShare(threadId);
    store.setState((current) => ({
      ...current,
      activeThreadId: threadId,
      pending: null,
      panelError: undefined,
      sidebarOpen: current.sidebarOpen || resolution?.status !== "resolved",
    }));
    if (replayMode !== null) {
      startReplay(threadId, replayMode);
    }
  }

  function blockReplayPointer(event: Event): void {
    const status = store.getState().replay?.view.status;
    if (!event.isTrusted || status === undefined || status === "done") {
      return;
    }
    const path = event.composedPath();
    const target = path[0];
    if (status === "input" && target instanceof Node && replayTarget?.contains(target) === true) {
      return;
    }
    if (
      event.target instanceof Node &&
      deps.isOwn(event.target) &&
      path.some(
        (node) => node instanceof Element && node.hasAttribute("data-sitenote-replay-controls"),
      )
    ) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || event.defaultPrevented) {
      return;
    }
    const state = store.getState();
    if (state.replay !== null) {
      event.preventDefault();
      event.stopImmediatePropagation();
      replayRunner?.stop();
      return;
    }
    if (deps.isOwn(event.target as Node | null)) {
      return;
    }
    if (state.pending !== null) {
      closePanel();
    } else if (state.commentMode) {
      exitCommentMode();
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
        if (replayTarget !== null) {
          refreshReplayHighlight();
        }
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
        void loadRecording(state.activeThreadId);
      }
    });
    const handleContextMenu = (event: MouseEvent): void => {
      const target = event.target;
      contextTarget =
        target instanceof Element && !deps.isOwn(target)
          ? { element: target, point: { clientX: event.clientX, clientY: event.clientY } }
          : null;
    };
    const handleFocus = (): void => {
      void refreshSelectionPlacement();
    };
    win.addEventListener("keydown", handleKeyDown, true);
    for (const type of REPLAY_POINTER_EVENTS) {
      win.addEventListener(type, blockReplayPointer, true);
    }
    win.addEventListener("hashchange", openThreadFromHash);
    win.addEventListener("focus", handleFocus);
    doc.addEventListener("contextmenu", handleContextMenu, { capture: true, passive: true });
    syncTargets(seen);
    void refreshSelectionPlacement();
    deactivate = () => {
      win.removeEventListener("keydown", handleKeyDown, true);
      for (const type of REPLAY_POINTER_EVENTS) {
        win.removeEventListener(type, blockReplayPointer, true);
      }
      win.removeEventListener("hashchange", openThreadFromHash);
      win.removeEventListener("focus", handleFocus);
      doc.removeEventListener("contextmenu", handleContextMenu, { capture: true });
      contextTarget = null;
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
      siteThreads: next.siteThreads,
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
    replayRunner?.detach();
    setReplayTarget(null);
    store.setState((state) => ({
      ...state,
      replay: null,
      replayGate: null,
      offPageThreadId: null,
    }));
    session.stop();
  }

  const session = createPageSession({
    origin: deps.origin,
    readPageUrl,
    backend: deps.backend,
    onState: handleSession,
  });

  async function submitNewThread(submission: ComposerSubmission): Promise<void> {
    const { pending, site, recordingAttached } = store.getState();
    const pageUrl = readPageUrl();
    if (pending === null || site === null || pageUrl === null || creating) {
      throw new Error(ERROR_MESSAGES.page_unavailable);
    }
    creating = true;
    store.setState((state) => ({ ...state, panelError: undefined }));
    try {
      const context = await deps.backend.collectContext();
      const result = await deps.backend.createThread({
        siteId: site.siteId,
        pageUrl,
        anchor: pending.anchor,
        context,
        ...(pending.captureId === null ? {} : { captureId: pending.captureId }),
        body: submission.body,
        mentions: submission.mentions,
        ...(recordingAttached ? { attachRecording: true } : {}),
        ...(submission.startsSignedOut === true ? { startsSignedOut: true } : {}),
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
          siteThreads: upsertThread(state.siteThreads, record),
          resolutions,
          pending: stillPending ? null : state.pending,
          activeThreadId: stillPending ? record.id : state.activeThreadId,
          recordingAttached: false,
          panelError: undefined,
        };
      });
    } finally {
      creating = false;
    }
  }

  function applyComment(comment: CommentRecord): void {
    store.setState((state) => ({
      ...state,
      threads: upsertComment(state.threads, comment),
      siteThreads: upsertComment(state.siteThreads, comment),
    }));
  }

  async function reply(threadId: string, submission: ComposerSubmission): Promise<void> {
    store.setState((state) => ({ ...state, panelError: undefined }));
    const result = await deps.backend.createComment({
      threadId,
      body: submission.body,
      mentions: submission.mentions,
    });
    if (!result.ok) {
      const message = result.error.message;
      store.setState((state) => ({ ...state, panelError: message }));
      throw new Error(message);
    }
    applyComment(result.data);
  }

  async function editComment(commentId: string, body: string): Promise<void> {
    const result = await deps.backend.updateComment({ commentId, body });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    applyComment(result.data);
  }

  async function deleteComment(commentId: string): Promise<void> {
    const result = await deps.backend.deleteComment(commentId);
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    applyComment(result.data);
  }

  async function toggleStatus(threadId: string): Promise<void> {
    const { threads, siteThreads } = store.getState();
    const thread =
      threads.find((candidate) => candidate.id === threadId) ??
      siteThreads.find((candidate) => candidate.id === threadId);
    if (thread === undefined) {
      return;
    }
    const result = await deps.backend.setStatus(
      threadId,
      thread.status === "open" ? "resolved" : "open",
    );
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
    store.setState((state) => ({
      ...state,
      threads: state.threads.some((candidate) => candidate.id === record.id)
        ? upsertThread(state.threads, record)
        : state.threads,
      siteThreads: upsertThread(state.siteThreads, record),
    }));
  }

  return {
    store,
    start: async () => {
      await session.start();
      if (store.getState().status === "ready") {
        void replayRunner?.resumeSaved();
      }
    },
    stop: shutdown,
    toggleCommentMode: () => {
      if (store.getState().commentMode) {
        exitCommentMode();
        return false;
      }
      setCommentMode(true);
      return true;
    },
    exitCommentMode,
    enterCommentMode: enterCommentModeWith,
    attachRecording: () => {
      const entered = enterCommentModeWith(RECORDING_ATTACHED_MESSAGE);
      if (entered) {
        store.setState((state) => ({ ...state, recordingAttached: true }));
      }
      return entered;
    },
    commentOnContextTarget: () => {
      const stored = contextTarget;
      contextTarget = null;
      if (store.getState().status !== "ready" || !stored?.element.isConnected) {
        return false;
      }
      setCommentMode(false);
      beginOnElement(stored.element, stored.point);
      return true;
    },
    toggleSidebar: () => {
      store.setState((state) => ({ ...state, sidebarOpen: !state.sidebarOpen }));
    },
    closeSidebar: () => {
      store.setState((state) => (state.sidebarOpen ? { ...state, sidebarOpen: false } : state));
    },
    setShowResolved,
    selectThread,
    openThread,
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
    createClickUpTask,
    linkJiraIssue,
    setShareAccess,
    copyThreadLink,
    dismissToast,
    startReplay,
    gateRun: runReplayGate,
    gateClose: () => {
      store.setState((state) => ({ ...state, replayGate: null }));
    },
    closeOffPage,
    openOffPagePage,
    reproduceOffPage: (threadId, mode) => {
      void replayOffPage(threadId, mode);
    },
    copyRoute,
    replayNext: () => {
      replayRunner?.next();
    },
    replayBack: () => {
      replayRunner?.back();
    },
    replayPause: () => {
      replayRunner?.pause();
    },
    replayResume: () => {
      replayRunner?.resume();
    },
    replaySkip: () => {
      replayRunner?.skip();
    },
    replayRetry: () => {
      replayRunner?.retry();
    },
    replayStop: () => {
      replayRunner?.stop();
    },
  };
}
