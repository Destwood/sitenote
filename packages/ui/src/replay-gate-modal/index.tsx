import { useEffect, useId, useRef, type KeyboardEvent } from "react";

import { PANEL_SURFACE, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../control-classes";
import { Z_INDEX } from "../z-index";

export interface ReplayGateModalProps {
  onRun: () => void;
  onClose: () => void;
}

const FOCUSABLE_SELECTOR = "button:not([disabled])";

export function ReplayGateModal({ onRun, onClose }: ReplayGateModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    primaryRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const items = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [];
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) {
      return;
    }
    if (event.shiftKey && event.target === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && event.target === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      style={{ zIndex: Z_INDEX.panel }}
      className="fixed inset-0 flex items-center justify-center bg-black/40 p-4"
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
        className={`flex w-[380px] max-w-full flex-col gap-3 p-5 ${PANEL_SURFACE}`}
      >
        <h2 id={titleId} className="text-base font-semibold">
          Sign out before reproducing
        </h2>
        <p id={descriptionId} className="text-neutral-700">
          The author started this recording signed out. If you are signed in, sign out first,
          otherwise the steps may not run as recorded.
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          <button ref={primaryRef} type="button" onClick={onRun} className={PRIMARY_BUTTON}>
            Run
          </button>
        </div>
      </div>
    </div>
  );
}
