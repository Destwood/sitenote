import { SITENOTE_ROOT_TAG } from "@sitenote/core";
import { RecordingPill } from "@sitenote/ui";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from "wxt/utils/content-script-ui/shadow-root";

import { RECORDING_MAX_MS } from "../recording-store";

export interface RecordingPillHandle {
  show: (startedAt: number) => void;
  hide: () => void;
}

export function createRecordingPill(
  ctx: ContentScriptContext,
  css: string,
  onStop: () => void,
): RecordingPillHandle {
  let ui: ShadowRootContentScriptUi<() => void> | null = null;
  let root: Root | null = null;
  let startedAt = 0;
  let visible = false;
  let creating = false;

  function render(): void {
    root?.render(createElement(RecordingPill, { startedAt, maxMs: RECORDING_MAX_MS, onStop }));
  }

  async function mount(): Promise<void> {
    creating = true;
    try {
      const created = await createShadowRootUi(ctx, {
        name: SITENOTE_ROOT_TAG,
        position: "inline",
        anchor: "body",
        css,
        onMount: (container) => {
          const mountedRoot = createRoot(container);
          root = mountedRoot;
          render();
          return () => {
            mountedRoot.unmount();
            root = null;
          };
        },
        onRemove: (unmount) => {
          unmount?.();
        },
      });
      if (visible) {
        created.mount();
        ui = created;
      }
    } finally {
      creating = false;
    }
  }

  return {
    show: (next) => {
      startedAt = next;
      visible = true;
      if (root !== null) {
        render();
      } else if (!creating) {
        void mount();
      }
    },
    hide: () => {
      visible = false;
      ui?.remove();
      ui = null;
    },
  };
}
