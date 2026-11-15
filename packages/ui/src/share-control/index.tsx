import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { FOCUS_RING, PANEL_SURFACE, SECONDARY_BUTTON } from "../control-classes";

export type ShareAccess = "workspace" | "link";

export interface ThreadShareControl {
  access: ShareAccess;
  pending: boolean;
  onAccessChange: (access: ShareAccess) => void;
  onCopy: () => Promise<boolean> | boolean;
}

const COPY_FEEDBACK_MS = 2000;

const SHARE_LABELS = {
  idle: "Copy link",
  copied: "Copied",
  failed: "Could not copy",
} as const;

const ACCESS_OPTIONS: readonly { value: ShareAccess; label: string }[] = [
  { value: "workspace", label: "Workspace members" },
  { value: "link", label: "Anyone with the link" },
];

export function ShareControl({ access, pending, onAccessChange, onCopy }: ThreadShareControl) {
  const [copyState, setCopyState] = useState<keyof typeof SHARE_LABELS>("idle");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (copyState === "idle") {
      return;
    }
    const timer = setTimeout(() => {
      setCopyState("idle");
    }, COPY_FEEDBACK_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [copyState]);

  useEffect(() => {
    if (!open) {
      return;
    }
    itemRefs.current[ACCESS_OPTIONS.findIndex((option) => option.value === access)]?.focus();
  }, [open, access]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handlePointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (root !== null && !event.composedPath().includes(root)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [open]);

  async function copyLink() {
    try {
      setCopyState((await onCopy()) ? "copied" : "failed");
    } catch {
      setCopyState("failed");
    }
  }

  function close() {
    setOpen(false);
    chevronRef.current?.focus();
  }

  function choose(next: ShareAccess) {
    close();
    onAccessChange(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) {
      return;
    }
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const items = itemRefs.current;
      const index = items.findIndex((item) => item === event.target);
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    }
  }

  const label = SHARE_LABELS[copyState];

  return (
    <div ref={rootRef} onKeyDown={handleKeyDown} className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => {
          void copyLink();
        }}
        className={`${SECONDARY_BUTTON} rounded-r-none`}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {copyState === "copied" ? (
            <path d="m5 12 4 4L19 6" />
          ) : (
            <>
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </>
          )}
        </svg>
      </button>
      <button
        ref={chevronRef}
        type="button"
        aria-label="Who can open the link"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={pending}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className={`${SECONDARY_BUTTON} rounded-l-none border-l-0 px-2`}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4">
          <path
            d="m6 8 4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <span className="sr-only" role="status">
        {copyState === "idle" ? "" : label}
      </span>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Who can open the link"
          className={`absolute top-full right-0 z-10 mt-1 w-48 p-1 ${PANEL_SURFACE}`}
        >
          {ACCESS_OPTIONS.map((option, index) => {
            const selected = option.value === access;
            return (
              <button
                key={option.value}
                ref={(element) => {
                  itemRefs.current[index] = element;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  choose(option.value);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-neutral-100 ${selected ? "font-semibold" : ""} ${FOCUS_RING}`}
              >
                {option.label}
                {selected ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="shrink-0"
                  >
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
