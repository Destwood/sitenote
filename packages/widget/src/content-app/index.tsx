import {
  CommentModeBanner,
  HighlightBox,
  Launcher,
  PIN_SIZE,
  PinLayer,
  SIDEBAR_WIDTH,
  SelectionButton,
  Sidebar,
  ThreadPanel,
  ToastRegion,
  type AnchorRect,
  type PinLayerPin,
  type ThreadView,
} from "@sitenote/ui";
import { useEffect, useMemo, useRef, type ReactNode } from "react";

import {
  PENDING_ID,
  SELECTION_ID,
  type ContentController,
  type ContentState,
} from "../content-controller";
import { buildMentionCandidates, buildThreadViews, canChangeStatus } from "../view-model";
import { useStore } from "../store";
import type { PinMeasurement } from "../pin-tracker";

export const PANEL_FALLBACK_MARGIN = 16;
export const PANEL_FALLBACK_TOP = 72;

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
  const openCount = views.filter((view) => view.status === "open").length;
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
        clickUp={{
          taskUrl: activeRecord.clickUpTaskUrl ?? null,
          canCreate: state.clickUpConfigured,
          pending: state.clickUpPending.has(activeView.id),
          onCreate: () => {
            void controller.createClickUpTask(activeView.id);
          },
        }}
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
        <SelectionButton rect={selectionMeasurement.rect} onClick={controller.startTextComment} />
      ) : null}
      {sidebarOpen ? (
        <div ref={sidebarRef} style={{ display: "contents" }}>
          <Sidebar
            key="sidebar"
            threads={views}
            activeThreadId={state.activeThreadId}
            showResolved={state.showResolved}
            onShowResolvedChange={controller.setShowResolved}
            onSelectThread={controller.selectThread}
            onClose={controller.closeSidebar}
          />
        </div>
      ) : (
        <div ref={launcherRef} style={{ display: "contents" }}>
          <Launcher openCount={openCount} expanded={false} onClick={controller.toggleSidebar} />
        </div>
      )}
      {panel}
      <ToastRegion toasts={state.toasts} onDismiss={controller.dismissToast} />
    </>
  );
}
