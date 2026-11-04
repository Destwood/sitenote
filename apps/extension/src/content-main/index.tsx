import { SITENOTE_ROOT_TAG } from "@sitenote/core";
import {
  RECORDING_ATTACHED_MESSAGE,
  createWidget,
  failure,
  success,
  summarizeThreads,
  type ContentState,
  type MessageResult,
} from "@sitenote/widget";
import { browser } from "wxt/browser";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from "wxt/utils/content-script-ui/shadow-root";

import { createToggleListener, restoreRecording } from "../comment-mode";
import { createExtensionBackend } from "../extension-backend";
import { sendMessage } from "../message-client";
import { createRecordingPill } from "../recording-pill";

export async function startContentScript(ctx: ContentScriptContext, css: string): Promise<void> {
  let ui: ShadowRootContentScriptUi<() => void> | null = null;
  let mounting = false;

  const widget = createWidget({ backend: createExtensionBackend(), document, window });
  const recordingPill = createRecordingPill(ctx, css, () => {
    void sendMessage({ type: "recording.stop" });
  });

  function syncHost(state: ContentState): void {
    if (ui === null) {
      return;
    }
    const attributes = {
      "data-thread-count": String(state.threads.length),
      "data-comment-count": String(
        state.threads.reduce((total, thread) => total + thread.comments.length, 0),
      ),
      "data-live": String(state.live),
      "data-comment-mode": state.commentMode ? "on" : "off",
    };
    for (const [name, value] of Object.entries(attributes)) {
      if (ui.shadowHost.getAttribute(name) !== value) {
        ui.shadowHost.setAttribute(name, value);
      }
    }
  }

  async function mountUi(): Promise<void> {
    if (ui !== null || mounting) {
      return;
    }
    mounting = true;
    try {
      const created = await createShadowRootUi(ctx, {
        name: SITENOTE_ROOT_TAG,
        position: "inline",
        anchor: "body",
        css,
        onMount: (container) => widget.render(container),
        onRemove: (unmount) => {
          unmount?.();
        },
      });
      created.mount();
      ui = created;
      syncHost(widget.store.getState());
    } finally {
      mounting = false;
    }
  }

  function unmountUi(): void {
    ui?.remove();
    ui = null;
  }

  widget.store.subscribe(() => {
    const state = widget.store.getState();
    if (state.status === "ready") {
      void mountUi();
    } else if (state.status === "disabled") {
      unmountUi();
    }
    syncHost(state);
  });

  function whenReady<Data>(run: () => Data): MessageResult<Data> {
    const { status } = widget.store.getState();
    if (status !== "ready") {
      return failure(status === "signedOut" ? "unauthorized" : "page_unavailable");
    }
    return success(run());
  }

  const toggleListener = createToggleListener({
    extensionId: browser.runtime.id,
    toggle: () => whenReady(() => ({ active: widget.toggleCommentMode() })),
    commentOnElement: () => whenReady(() => ({ started: widget.commentOnContextTarget() })),
    listThreads: () =>
      whenReady(() => {
        const { threads, resolutions } = widget.store.getState();
        return summarizeThreads(threads, resolutions);
      }),
    openThread: (threadId) =>
      whenReady(() => {
        const opened = widget.store.getState().threads.some((thread) => thread.id === threadId);
        if (opened) {
          widget.selectThread(threadId);
        }
        return { opened };
      }),
    openSidebar: () =>
      whenReady(() => {
        if (!widget.store.getState().sidebarOpen) {
          widget.toggleSidebar();
        }
        return { opened: true };
      }),
    recording: {
      show: (startedAt) => {
        recordingPill.show(startedAt);
      },
      hide: () => {
        recordingPill.hide();
      },
      attach: () =>
        widget.enterCommentMode(RECORDING_ATTACHED_MESSAGE)
          ? success(null)
          : failure("page_unavailable"),
    },
  });
  browser.runtime.onMessage.addListener(toggleListener);
  ctx.onInvalidated(() => {
    browser.runtime.onMessage.removeListener(toggleListener);
    widget.stop();
    unmountUi();
    recordingPill.hide();
  });

  await widget.start();
  if (widget.store.getState().status === "ready") {
    await restoreRecording(() => sendMessage({ type: "recording.status" }), recordingPill.show);
  }
}
