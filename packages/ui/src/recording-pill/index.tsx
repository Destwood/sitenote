import { useEffect, useState } from "react";

import { FOCUS_RING } from "../control-classes";
import { Z_INDEX } from "../z-index";

export interface RecordingPillProps {
  startedAt: number;
  maxMs: number;
  onStop: () => void;
  now?: () => number;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export function RecordingPill({ startedAt, maxMs, onStop, now = Date.now }: RecordingPillProps) {
  const [current, setCurrent] = useState(now);

  useEffect(() => {
    const id = setInterval(() => {
      setCurrent(now());
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [now]);

  const elapsed = Math.min(Math.max(current - startedAt, 0), maxMs);

  return (
    <div
      role="group"
      aria-label="Screen recording"
      style={{ zIndex: Z_INDEX.banner }}
      className="pointer-events-auto fixed inset-x-0 bottom-4 mx-auto flex w-fit max-w-[calc(100vw-32px)] items-center gap-3 rounded-full bg-neutral-900 py-1.5 pr-1.5 pl-4 font-sans text-sm text-white shadow-lg"
    >
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-red-500" />
      <span className="tabular-nums">{formatElapsed(elapsed)}</span>
      <button
        type="button"
        onClick={onStop}
        className={`rounded-full bg-white px-3 py-1 text-sm font-semibold text-neutral-900 hover:bg-neutral-200 ${FOCUS_RING}`}
      >
        Stop recording
      </button>
    </div>
  );
}
