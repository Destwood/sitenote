import { SITENOTE_ROOT_TAG, parsePageUrl } from "@sitenote/core";
import {
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
import { createStepRecorder } from "../step-recorder";

export async function startContentScript(ctx: ContentScriptContext, css: string): Promise<void> {
  let ui: ShadowRootContentScriptUi<() => void> | null = null;
  let mounting = false;

  const widget = createWidget({ backend: createExtensionBackend(), document, window });
  const recordingPill = createRecordingPill(ctx, css, () => {
    void sendMessage({ type: "recording.stop" });
  });
  const stepRecorder = createStepRecorder({
    doc: document,
    win: window,
    now: () => Date.now(),
    send: (step) => {
      void sendMessage({ type: "recording.step", step }).catch(() => undefined);
    },
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
        const { siteThreads, resolutions } = widget.store.getState();
        return summarizeThreads(
          siteThreads,
          resolutions,
          parsePageUrl(window.location.href)?.page ?? null,
        );
      }),
    openThread: (threadId) => whenReady(() => ({ opened: widget.openThread(threadId) })),
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
      attach: () => (widget.attachRecording() ? success(null) : failure("page_unavailable")),
    },
    steps: stepRecorder,
  });
  browser.runtime.onMessage.addListener(toggleListener);
  ctx.onInvalidated(() => {
    browser.runtime.onMessage.removeListener(toggleListener);
    widget.stop();
    unmountUi();
    recordingPill.hide();
    stepRecorder.stop();
  });

  await widget.start();
  if (widget.store.getState().status === "ready") {
    await restoreRecording(() => sendMessage({ type: "recording.status" }), {
      show: recordingPill.show,
      startSteps: (startedAt, options) => {
        stepRecorder.start(startedAt, options);
      },
      now: () => Date.now(),
    });
  }
}
