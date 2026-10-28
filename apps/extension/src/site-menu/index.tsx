import { useRef, useState, type FocusEvent, type KeyboardEvent } from "react";

import { MENU_ITEM_CLASS } from "../form-controls";
import { SelectionPlacementControl } from "../selection-placement-control";

interface SiteMenuProps {
  webUrl: string;
  captureErrors: boolean | null;
  busy: boolean;
  onToggleCapture: (enabled: boolean) => void;
  onDisable: () => void;
  onManageSites: () => void;
}

export function SiteMenu({
  webUrl,
  captureErrors,
  busy,
  onToggleCapture,
  onDisable,
  onManageSites,
}: SiteMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (open && event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && !wrapperRef.current?.contains(next)) {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative" onKeyDown={handleKeyDown} onBlur={handleBlur}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="More options"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="site-menu-panel"
        onClick={() => {
          setOpen((value) => !value);
        }}
        className="inline-flex size-8 items-center justify-center rounded-md text-neutral-700 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" className="size-4">
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="13" cy="8" r="1.5" />
        </svg>
      </button>
      {open ? (
        <div
          id="site-menu-panel"
          role="group"
          aria-label="More options"
          className="absolute right-0 z-10 mt-1 flex w-64 flex-col gap-0.5 rounded-md border border-neutral-200 bg-white p-1 shadow-md"
        >
          <SelectionPlacementControl />
          {captureErrors === null ? null : (
            <label className={`${MENU_ITEM_CLASS} cursor-pointer`}>
              <input
                type="checkbox"
                checked={captureErrors}
                disabled={busy}
                onChange={(event) => {
                  onToggleCapture(event.target.checked);
                }}
                className="size-4 accent-neutral-900"
              />
              Capture console errors
            </label>
          )}
          <button
            type="button"
            className={MENU_ITEM_CLASS}
            onClick={() => {
              setOpen(false);
              onManageSites();
            }}
          >
            Allowed sites
          </button>
          <a href={`${webUrl}/app`} target="_blank" rel="noreferrer" className={MENU_ITEM_CLASS}>
            Open dashboard
          </a>
          {captureErrors === null ? null : (
            <>
              <hr className="my-1 border-neutral-200" />
              <button
                type="button"
                disabled={busy}
                className={`${MENU_ITEM_CLASS} text-red-700`}
                onClick={() => {
                  setOpen(false);
                  onDisable();
                }}
              >
                Disable on this site
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
