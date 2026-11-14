"use client";

import { useEffect, useId, useRef, useState } from "react";

import { DASH_BUTTON_SECONDARY_CLASS } from "../dashboard-classes";

export const THREAD_COLUMNS = [
  { id: "domain", label: "Domain" },
  { id: "route", label: "Route" },
  { id: "firstComment", label: "First comment" },
  { id: "author", label: "Author" },
  { id: "status", label: "Status" },
  { id: "comments", label: "Comments" },
  { id: "created", label: "Created" },
  { id: "lastActivity", label: "Last activity" },
] as const;

type ThreadColumnId = (typeof THREAD_COLUMNS)[number]["id"];

const STORAGE_KEY = "sitenote.thread-columns";

function readHidden(): ThreadColumnId[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }
    const hidden = THREAD_COLUMNS.map((column) => column.id).filter((id) => parsed.includes(id));
    return hidden.length === THREAD_COLUMNS.length ? [] : hidden;
  } catch {
    return [];
  }
}

function writeHidden(hidden: readonly ThreadColumnId[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(hidden));
  } catch {
    return;
  }
}

interface ThreadColumnPickerProps {
  targetId: string;
}

export function ThreadColumnPicker({ targetId }: ThreadColumnPickerProps) {
  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<readonly ThreadColumnId[]>(readHidden);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (target === null) {
      return;
    }
    if (hidden.length === 0) {
      target.removeAttribute("data-hidden-cols");
    } else {
      target.setAttribute("data-hidden-cols", hidden.join(" "));
    }
  }, [hidden, targetId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!(event.target instanceof Node) || !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const visibleCount = THREAD_COLUMNS.length - hidden.length;

  function toggle(id: ThreadColumnId) {
    const next = hidden.includes(id)
      ? hidden.filter((hiddenId) => hiddenId !== id)
      : [...hidden, id];
    setHidden(next);
    writeHidden(next);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => {
          setOpen((isOpen) => !isOpen);
        }}
        className={DASH_BUTTON_SECONDARY_CLASS}
      >
        Columns
      </button>
      {open ? (
        <div
          id={popoverId}
          className="absolute top-full right-0 z-20 mt-1 flex w-44 flex-col gap-0.5 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg"
        >
          {THREAD_COLUMNS.map((column) => {
            const checked = !hidden.includes(column.id);
            return (
              <label
                key={column.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={checked && visibleCount === 1}
                  onChange={() => {
                    toggle(column.id);
                  }}
                  className="size-4 accent-neutral-900"
                />
                {column.label}
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
