import { formatThreadContextMarkdown, isRecordedAction, parsePageUrl } from "@sitenote/core";
import {
  CommentModeBanner,
  HighlightBox,
  Launcher,
  OffPageThreadCard,
  PIN_SIZE,
  PinLayer,
  ReplayBar,
  ReplayGateModal,
  SIDEBAR_WIDTH,
  SelectionButton,
  Sidebar,
  ThreadPanel,
  ToastRegion,
  type AnchorRect,
  type PinLayerPin,
  type SiteThreadItem,
  type ThreadView,
} from "@sitenote/ui";
import { useEffect, useMemo, useRef, type ReactNode } from "react";

import {
  PENDING_ID,
  SELECTION_ID,
  type ContentController,
  type ContentState,
} from "../content-controller";
import {
  buildMentionCandidates,
  buildThreadViews,
  canChangeStatus,
  numberingOrder,
} from "../view-model";
import { useStore } from "../store";
import type { PinMeasurement } from "../pin-tracker";
import type { ThreadRecord } from "../transport";

export const PANEL_FALLBACK_MARGIN = 16;
export const PANEL_FALLBACK_TOP = 72;
const EXCERPT_LIMIT = 80;

export interface ContentAppProps {
  controller: ContentController;
}

function pinRect(measurement: PinMeasurement): AnchorRect {
  return {
    x: measurement.x - PIN_SIZE / 2,
    y: measurement.y - PIN_SIZE / 2,
    width: PIN_SIZE,
    height: PIN_SIZE,
  };
}

function fallbackRect(sidebarOpen: boolean): AnchorRect {
  return {
    x: window.innerWidth - (sidebarOpen ? SIDEBAR_WIDTH : 0) - PANEL_FALLBACK_MARGIN,
    y: PANEL_FALLBACK_TOP,
    width: 0,
    height: 0,
  };
}

function buildPins(state: ContentState, views: readonly ThreadView[]): PinLayerPin[] {
  const pins: PinLayerPin[] = [];
  for (const view of views) {
    const measurement = state.positions.get(view.id);
    if (view.orphaned || measurement === undefined) {
      continue;
    }
    pins.push({
      threadId: view.id,
      number: view.number,
      status: view.status,
      x: measurement.x,
      y: measurement.y,
      visible:
        measurement.visible &&
        (view.status === "open" || state.showResolved || view.id === state.activeThreadId),
    });
  }
  const pendingMeasurement = state.positions.get(PENDING_ID);
  if (state.pending !== null && pendingMeasurement !== undefined) {
    pins.push({
      threadId: PENDING_ID,
      number: views.length + 1,
      status: "open",
      x: pendingMeasurement.x,
      y: pendingMeasurement.y,
      visible: pendingMeasurement.visible,
      pending: true,
    });
  }
  return pins;
}

function routeOf(url: string): string {
  return URL.parse(url)?.pathname ?? "/";
}

function excerptOf(thread: ThreadRecord): string {
  const first = thread.comments.find((comment) => !comment.deleted);
  if (first === undefined) {
    return "Comment deleted";
  }
  const text = first.body.replace(/\s+/g, " ").trim();
  return text.length > EXCERPT_LIMIT ? `${text.slice(0, EXCERPT_LIMIT)}…` : text;
}

function copyContextOf(thread: ThreadRecord): () => Promise<boolean> {
  return async () => {
    try {
      await navigator.clipboard.writeText(
        formatThreadContextMarkdown({
          excerpt: thread.comments.find((comment) => !comment.deleted)?.body ?? "",
          authorName: thread.author.displayName,
          status: thread.status,
          pageUrl: thread.pageUrl,
          context: thread.context,
          anchor: thread.anchor,
        }),
      );
      return true;
    } catch {
      return false;
    }
  };
}

function buildOtherPages(
  siteThreads: readonly ThreadRecord[],
  currentPageKey: string | null,
): SiteThreadItem[] {
  const groups = new Map<string, ThreadRecord[]>();
  for (const thread of siteThreads) {
    if (thread.pageUrl !== currentPageKey) {
      groups.set(thread.pageUrl, [...(groups.get(thread.pageUrl) ?? []), thread]);
    }
  }
  return [...groups].flatMap(([pageUrl, group]) =>
    numberingOrder(group).map((thread, index) => ({
      id: thread.id,
      number: index + 1,
      status: thread.status,
      authorName: thread.author.displayName,
      excerpt: excerptOf(thread),
      replies: Math.max(0, thread.comments.filter((comment) => !comment.deleted).length - 1),
      route: routeOf(pageUrl),
      hasSteps: thread.context?.recording?.steps?.some(isRecordedAction) === true,
    })),
  );
}

function focusFirstButton(container: HTMLElement | null): void {
  container?.querySelector("button")?.focus();
}

export function ContentApp({ controller }: ContentAppProps) {
  const state = useStore(controller.store, (current) => current);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLDivElement>(null);
  const sidebarWasOpen = useRef(false);

  const { site, threads, members, resolutions, sidebarOpen } = state;
  const userId = site?.userId ?? "";
  const views = useMemo(
    () => buildThreadViews(threads, resolutions, userId, members),
    [threads, resolutions, userId, members],
  );
  const mentionCandidates = useMemo(
    () => buildMentionCandidates(members, userId),
    [members, userId],
  );

  useEffect(() => {
    if (sidebarOpen) {
      focusFirstButton(sidebarRef.current);
    } else if (sidebarWasOpen.current) {
      focusFirstButton(launcherRef.current);
    }
    sidebarWasOpen.current = sidebarOpen;
  }, [sidebarOpen]);

  const pins = buildPins(state, views);
  const currentPageKey = parsePageUrl(window.location.href)?.page ?? null;
  const currentRoute = routeOf(window.location.href);
  const otherPages = useMemo(
    () => buildOtherPages(state.siteThreads, currentPageKey),
    [state.siteThreads, currentPageKey],
  );
  const offPageItem =
    state.offPageThreadId === null
      ? undefined
      : otherPages.find((item) => item.id === state.offPageThreadId);
  const offPageRecord =
    offPageItem === undefined
      ? undefined
      : state.siteThreads.find((thread) => thread.id === offPageItem.id);
  const offPageThread =
    offPageRecord === undefined
      ? undefined
      : buildThreadViews([offPageRecord], new Map(), "", members)[0];
  const openCount = views.filter((view) => view.status === "open").length;
  const siteOpenCount =
    state.siteThreads.length === 0
      ? openCount
      : state.siteThreads.filter((thread) => thread.status === "open").length;
  const activeView = views.find((view) => view.id === state.activeThreadId);
  const activeRecord = threads.find((thread) => thread.id === state.activeThreadId);
  const activeMeasurement =
    state.activeThreadId === null ? undefined : state.positions.get(state.activeThreadId);
  const pendingMeasurement = state.positions.get(PENDING_ID);
  const selectionMeasurement =
    state.selection === null ? undefined : state.positions.get(SELECTION_ID);

  let panel: ReactNode = null;
  if (state.pending !== null) {
    panel = (
      <ThreadPanel
        key={PENDING_ID}
        thread={null}
        anchorRect={
          pendingMeasurement === undefined ? fallbackRect(sidebarOpen) : pinRect(pendingMeasurement)
        }
        canChangeStatus={false}
        error={state.panelError}
        mentionCandidates={mentionCandidates}
        recordingAttached={state.recordingAttached}
        onSubmit={controller.submitNewThread}
        onEditComment={() => Promise.resolve()}
        onDeleteComment={() => Promise.resolve()}
        onToggleStatus={() => undefined}
        onClose={controller.closePanel}
      />
    );
  } else if (activeView !== undefined && activeRecord !== undefined && site !== null) {
    panel = (
      <ThreadPanel
        key={activeView.id}
        thread={activeView}
        anchorRect={
          activeMeasurement === undefined || activeView.orphaned
            ? fallbackRect(sidebarOpen)
            : pinRect(activeMeasurement)
        }
        canChangeStatus={canChangeStatus(site, activeRecord)}
        error={state.panelError}
        mentionCandidates={mentionCandidates}
        screenshot={state.screenshots.get(activeView.id)}
        recording={state.recordings.get(activeView.id)}
        onReplaySteps={
          state.replayAvailable
            ? (mode) => {
                controller.startReplay(activeView.id, mode);
              }
            : undefined
        }
        onCopyContext={copyContextOf(activeRecord)}
        clickUp={{
          taskUrl: activeRecord.clickUpTaskUrl ?? null,
          canCreate: state.clickUpConfigured,
          pending: state.clickUpPending.has(activeView.id),
          onCreate: () => {
            void controller.createClickUpTask(activeView.id);
          },
        }}
        jira={{
          issueKey: activeRecord.jiraIssueKey ?? null,
          issueUrl: activeRecord.jiraIssueUrl ?? null,
          canLink: state.jiraConfigured,
          pending: state.jiraPending.has(activeView.id),
          onLink: (issueKey) => {
            void controller.linkJiraIssue(activeView.id, issueKey);
          },
        }}
        share={
          site.role === "guest"
            ? undefined
            : {
                access: state.shares.get(activeView.id) ? "link" : "workspace",
                pending: state.sharePending.has(activeView.id),
                onAccessChange: (access) => {
                  void controller.setShareAccess(activeView.id, access);
                },
                onCopy: () => controller.copyThreadLink(activeView.id),
              }
        }
        onSubmit={(submission) => controller.reply(activeView.id, submission)}
        onEditComment={controller.editComment}
        onDeleteComment={controller.deleteComment}
        onToggleStatus={() => {
          void controller.toggleStatus(activeView.id);
        }}
        onClose={controller.closePanel}
      />
    );
  }

  return (
    <>
      {state.fallbackHighlights
        ? [...state.positions].flatMap(([id, measurement]) =>
            id === SELECTION_ID || !measurement.visible
              ? []
              : measurement.rects.map((rect, index) => (
                  <HighlightBox key={`${id}:${String(index)}`} rect={rect} />
                )),
          )
        : null}
      {state.commentMode && state.hover !== null ? <HighlightBox rect={state.hover} /> : null}
      <PinLayer
        pins={pins}
        activeThreadId={state.pending === null ? state.activeThreadId : PENDING_ID}
        onSelectPin={controller.togglePin}
      />
      {state.commentMode ? <CommentModeBanner onExit={controller.exitCommentMode} /> : null}
      {selectionMeasurement?.visible === true ? (
        <SelectionButton
          rect={selectionMeasurement.rect}
          onClick={controller.startTextComment}
          placement={state.selectionPlacement}
        />
      ) : null}
      {sidebarOpen ? (
        <div ref={sidebarRef} style={{ display: "contents" }}>
          <Sidebar
            key="sidebar"
            threads={views}
            otherPages={otherPages}
            currentRoute={currentRoute}
            onOpenOtherPage={(threadId) => {
              controller.openThread(threadId);
            }}
            onCopyRoute={controller.copyRoute}
            activeThreadId={state.activeThreadId}
            showResolved={state.showResolved}
            onShowResolvedChange={controller.setShowResolved}
            onSelectThread={controller.selectThread}
            onClose={controller.closeSidebar}
          />
        </div>
      ) : (
        <div ref={launcherRef} style={{ display: "contents" }}>
          <Launcher openCount={siteOpenCount} expanded={false} onClick={controller.toggleSidebar} />
        </div>
      )}
      {state.replay !== null && state.replay.highlight !== null ? (
        <HighlightBox rect={state.replay.highlight} />
      ) : null}
      {state.replay === null ? null : (
        <ReplayBar
          mode={state.replay.view.mode}
          index={state.replay.view.index}
          total={state.replay.view.total}
          status={state.replay.view.status}
          label={state.replay.view.label}
          message={state.replay.view.message}
          inputRect={state.replay.view.status === "input" ? state.replay.highlight : null}
          onBack={controller.replayBack}
          onNext={controller.replayNext}
          onPause={controller.replayPause}
          onResume={controller.replayResume}
          onSkip={controller.replaySkip}
          onRetry={controller.replayRetry}
          onStop={controller.replayStop}
        />
      )}
      {panel}
      {offPageItem === undefined ? null : (
        <OffPageThreadCard
          item={offPageItem}
          thread={offPageThread}
          sidebarOpen={sidebarOpen}
          onReproduce={(mode) => {
            controller.reproduceOffPage(offPageItem.id, mode);
          }}
          onOpenPage={() => {
            controller.openOffPagePage(offPageItem.id);
          }}
          onToggleStatus={() => {
            void controller.toggleStatus(offPageItem.id);
          }}
          onCopyRoute={controller.copyRoute}
          onCopyContext={offPageRecord === undefined ? undefined : copyContextOf(offPageRecord)}
          onClose={controller.closeOffPage}
        />
      )}
      {state.replayGate === null ? null : (
        <ReplayGateModal onRun={controller.gateRun} onClose={controller.gateClose} />
      )}
      <ToastRegion toasts={state.toasts} onDismiss={controller.dismissToast} />
    </>
  );
}
