import { SITENOTE_ROOT_TAG } from "@sitenote/core";
import { createRoot, type Root } from "react-dom/client";
import { browser } from "wxt/browser";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from "wxt/utils/content-script-ui/shadow-root";

import { createToggleListener } from "../comment-mode";
import { ContentApp } from "../content-app";
import { createContentController, type ContentState } from "../content-controller";
import { isolateEvents } from "../event-isolation";
import { sendMessage } from "../message-client";
import { failure, success } from "../messages";
import { openPageConnection } from "../page-connection";

export async function startContentScript(ctx: ContentScriptContext, css: string): Promise<void> {
  let ui: ShadowRootContentScriptUi<Root> | null = null;
  let mounting = false;

  function isOwn(node: Node | null): boolean {
    const host = ui?.shadowHost;
    return host !== undefined && node !== null && (node === host || host.contains(node));
  }

  const controller = createContentController({
    win: window,
    doc: document,
    origin: location.origin,
    isOwn,
    send: sendMessage,
    openConnection: (options) =>
      openPageConnection({ ...options, connect: (name) => browser.runtime.connect({ name }) }),
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
        onMount(container) {
          isolateEvents(container);
          const root = createRoot(container);
          root.render(<ContentApp controller={controller} />);
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });
      created.mount();
      ui = created;
      syncHost(controller.store.getState());
    } finally {
      mounting = false;
    }
  }

  function unmountUi(): void {
    ui?.remove();
    ui = null;
  }

  controller.store.subscribe(() => {
    const state = controller.store.getState();
    if (state.status === "ready") {
      void mountUi();
    } else if (state.status === "disabled") {
      unmountUi();
    }
    syncHost(state);
  });

  const toggleListener = createToggleListener({
    extensionId: browser.runtime.id,
    toggle: () => {
      const { status } = controller.store.getState();
      if (status !== "ready") {
        return failure(status === "signedOut" ? "unauthorized" : "page_unavailable");
      }
      return success({ active: controller.toggleCommentMode() });
    },
  });
  browser.runtime.onMessage.addListener(toggleListener);
  ctx.onInvalidated(() => {
    browser.runtime.onMessage.removeListener(toggleListener);
    controller.stop();
    unmountUi();
  });

  await controller.start();
}
