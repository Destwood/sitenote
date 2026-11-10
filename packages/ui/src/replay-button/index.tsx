import { REPLAY_MODES, type ReplayMode } from "@sitenote/core";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { FOCUS_RING, PANEL_SURFACE, SECONDARY_BUTTON } from "../control-classes";

export const REPLAY_MODE_LABELS: Readonly<Record<ReplayMode, string>> = {
  step: "Step by step",
  auto: "Autoplay",
};

export interface ReplayButtonProps {
  onReplay: (mode: ReplayMode) => void;
  label?: string;
  className?: string;
}

export function ReplayButton({ onReplay, label = "Replay on page", className }: ReplayButtonProps) {
  const [mode, setMode] = useState<ReplayMode>("step");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    itemRefs.current[REPLAY_MODES.indexOf(mode)]?.focus();
  }, [open, mode]);

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

  function close() {
    setOpen(false);
    chevronRef.current?.focus();
  }

  function choose(next: ReplayMode) {
    setMode(next);
    close();
    onReplay(next);
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

  return (
    <div
      ref={rootRef}
      onKeyDown={handleKeyDown}
      className={`relative inline-flex ${className ?? ""}`}
    >
      <button
        type="button"
        onClick={() => {
          onReplay(mode);
        }}
        className={`${SECONDARY_BUTTON} rounded-r-none`}
      >
        {label}
        <span className="ml-1 font-normal text-neutral-600">{REPLAY_MODE_LABELS[mode]}</span>
      </button>
      <button
        ref={chevronRef}
        type="button"
        aria-label="Choose replay mode"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
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
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Replay mode"
          className={`absolute top-full left-0 z-10 mt-1 w-40 p-1 ${PANEL_SURFACE}`}
        >
          {REPLAY_MODES.map((item, index) => (
            <button
              key={item}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={mode === item}
              onClick={() => {
                choose(item);
              }}
              className={`block w-full rounded-sm px-2 py-1.5 text-left hover:bg-neutral-100 ${FOCUS_RING}`}
            >
              {REPLAY_MODE_LABELS[item]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
