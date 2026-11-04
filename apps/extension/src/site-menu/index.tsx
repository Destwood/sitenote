import { useRef, useState, type FocusEvent, type KeyboardEvent } from "react";

import { MENU_ITEM_CLASS } from "../form-controls";
import { Icon } from "../icon";
import { SelectionPlacementControl } from "../selection-placement-control";

interface SiteMenuProps {
  dashboardUrl: string;
  captureErrors: boolean | null;
  busy: boolean;
  onToggleCapture: (enabled: boolean) => void;
  onDisable: () => void;
  onManageSites: () => void;
}

export function SiteMenu({
  dashboardUrl,
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
        className="flex size-7 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
      >
        <Icon name="more" size={16} />
      </button>
      {open ? (
        <div
          id="site-menu-panel"
          role="group"
          aria-label="More options"
          className="absolute right-0 z-10 mt-1 flex w-60 flex-col gap-0.5 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg"
        >
          <SelectionPlacementControl />
          {captureErrors === null ? null : (
            <label className="relative flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-neutral-100">
              <span className="flex flex-col">
                <span id="capture-console-errors" className="text-sm font-medium text-neutral-900">
                  Capture console errors
                </span>
                <span className="text-xs text-neutral-500">Attach recent errors to comments</span>
              </span>
              <input
                type="checkbox"
                aria-labelledby="capture-console-errors"
                checked={captureErrors}
                disabled={busy}
                onChange={(event) => {
                  onToggleCapture(event.target.checked);
                }}
                className="peer absolute top-1/2 right-2 h-4 w-7 -translate-y-1/2 cursor-pointer opacity-0 disabled:cursor-default"
              />
              <span className="pointer-events-none relative inline-flex h-4 w-7 shrink-0 rounded-full bg-neutral-300 transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-3 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:content-[''] peer-checked:bg-green-600 peer-checked:after:translate-x-3 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-neutral-900 peer-disabled:opacity-60" />
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
            <Icon name="sites" size={15} />
            Allowed sites
          </button>
          <a href={dashboardUrl} target="_blank" rel="noreferrer" className={MENU_ITEM_CLASS}>
            <Icon name="external" size={15} />
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
                <Icon name="error" size={15} />
                Disable on this site
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
