import { SITENOTE_ROOT_TAG, parsePageUrl } from "@sitenote/core";
import { HelloOverlay } from "@sitenote/ui";
import { createRoot, type Root } from "react-dom/client";
import { browser } from "wxt/browser";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from "wxt/utils/content-script-ui/shadow-root";

import { createToggleListener } from "../comment-mode";
import { sendMessage } from "../message-client";
import { failure, success } from "../messages";
import { openPageConnection } from "../page-connection";
import { createPageSession, type PageSessionState } from "../page-session";

export async function startContentScript(ctx: ContentScriptContext, css: string): Promise<void> {
  let state: PageSessionState = {
    status: "starting",
    site: null,
    threads: [],
    live: false,
    error: null,
  };
  let commentMode = false;
  let ui: ShadowRootContentScriptUi<Root> | null = null;
  let mounting = false;

  function syncHost(): void {
    if (ui === null) {
      return;
    }
    ui.shadowHost.setAttribute("data-thread-count", String(state.threads.length));
    ui.shadowHost.setAttribute(
      "data-comment-count",
      String(state.threads.reduce((total, thread) => total + thread.comments.length, 0)),
    );
    ui.shadowHost.setAttribute("data-live", String(state.live));
    ui.shadowHost.setAttribute("data-comment-mode", commentMode ? "on" : "off");
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
          const root = createRoot(container);
          root.render(<HelloOverlay />);
          return root;
        },
        onRemove(root) {
          root?.unmount();
        },
      });
      created.mount();
      ui = created;
      syncHost();
    } finally {
      mounting = false;
    }
  }

  function unmountUi(): void {
    ui?.remove();
    ui = null;
    commentMode = false;
  }

  const session = createPageSession({
    origin: location.origin,
    readPageUrl: () => parsePageUrl(location.href)?.page ?? null,
    send: sendMessage,
    openConnection: (options) =>
      openPageConnection({ ...options, connect: (name) => browser.runtime.connect({ name }) }),
    onState: (next) => {
      state = next;
      if (next.status === "ready") {
        void mountUi();
      } else if (next.status === "disabled") {
        unmountUi();
      }
      syncHost();
    },
  });

  const toggleListener = createToggleListener({
    extensionId: browser.runtime.id,
    toggle: () => {
      if (state.status !== "ready") {
        return failure(state.status === "signedOut" ? "unauthorized" : "page_unavailable");
      }
      commentMode = !commentMode;
      syncHost();
      return success({ active: commentMode });
    },
  });
  browser.runtime.onMessage.addListener(toggleListener);
  ctx.addEventListener(window, "wxt:locationchange", () => {
    session.navigate();
  });
  ctx.onInvalidated(() => {
    browser.runtime.onMessage.removeListener(toggleListener);
    session.stop();
  });

  await session.start();
}
