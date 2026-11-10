import { SITENOTE_ROOT_TAG } from "@sitenote/core";
import { createRoot } from "react-dom/client";

import type { WidgetBackend } from "../backend";
import { ContentApp } from "../content-app";
import { createContentController, type ContentController } from "../content-controller";
import { isolateEvents } from "../event-isolation";
import { createPreferenceClient } from "../preference-client";
import { createScreenshotTaker } from "../screenshot-taker";

export interface WidgetOptions {
  backend: WidgetBackend;
  document: Document;
  window: Window;
}

export interface MountWidgetOptions extends WidgetOptions {
  host: ShadowRoot | HTMLElement;
}

export interface Widget {
  store: ContentController["store"];
  start: ContentController["start"];
  stop: ContentController["stop"];
  toggleCommentMode: ContentController["toggleCommentMode"];
  enterCommentMode: ContentController["enterCommentMode"];
  attachRecording: ContentController["attachRecording"];
  commentOnContextTarget: ContentController["commentOnContextTarget"];
  selectThread: ContentController["selectThread"];
  openThread: ContentController["openThread"];
  toggleSidebar: ContentController["toggleSidebar"];
  render: (container: HTMLElement) => () => void;
}

export interface WidgetHandle {
  unmount: () => void;
  setCommentMode: (on: boolean) => void;
  openThread: (threadId: string) => void;
}

function ownElement(container: HTMLElement | null): HTMLElement | null {
  if (container === null) {
    return null;
  }
  const root = container.getRootNode();
  return root instanceof ShadowRoot && root.host instanceof HTMLElement ? root.host : container;
}

function isInSitenoteRoot(node: Node): boolean {
  let current: Node | null = node;
  while (current !== null) {
    if (current instanceof Element && current.localName === SITENOTE_ROOT_TAG) {
      return true;
    }
    current = current instanceof ShadowRoot ? current.host : current.parentNode;
  }
  return false;
}

export function createWidget({ backend, document, window }: WidgetOptions): Widget {
  let container: HTMLElement | null = null;

  function isOwn(node: Node | null): boolean {
    if (node === null) {
      return false;
    }
    const host = ownElement(container);
    return (host !== null && (node === host || host.contains(node))) || isInSitenoteRoot(node);
  }

  const controller = createContentController({
    win: window,
    doc: document,
    origin: window.location.origin,
    isOwn,
    backend,
    preference: createPreferenceClient(backend),
    screenshot: createScreenshotTaker({
      win: window,
      backend,
      setHostHidden: (hidden) => {
        const host = ownElement(container);
        if (host === null) {
          return;
        }
        if (hidden) {
          host.style.setProperty("visibility", "hidden", "important");
        } else {
          host.style.removeProperty("visibility");
        }
      },
    }),
  });

  return {
    store: controller.store,
    start: controller.start,
    stop: controller.stop,
    toggleCommentMode: controller.toggleCommentMode,
    enterCommentMode: controller.enterCommentMode,
    attachRecording: controller.attachRecording,
    commentOnContextTarget: controller.commentOnContextTarget,
    selectThread: controller.selectThread,
    openThread: controller.openThread,
    toggleSidebar: controller.toggleSidebar,
    render: (target) => {
      container = target;
      isolateEvents(target);
      const root = createRoot(target);
      root.render(<ContentApp controller={controller} />);
      return () => {
        root.unmount();
        container = null;
      };
    },
  };
}

export function mountWidget({ host, ...options }: MountWidgetOptions): WidgetHandle {
  const widget = createWidget(options);
  const container =
    host instanceof ShadowRoot ? host.appendChild(options.document.createElement("div")) : host;
  const unmountRender = widget.render(container);
  void widget.start();
  return {
    unmount: () => {
      widget.stop();
      unmountRender();
    },
    setCommentMode: (on) => {
      if (widget.store.getState().commentMode !== on) {
        widget.toggleCommentMode();
      }
    },
    openThread: (threadId) => {
      widget.selectThread(threadId);
    },
  };
}
