import { FOCUS_RING } from "../control-classes";
import type { ThreadStatus } from "../types";

export const PIN_SIZE = 24;

export interface PinProps {
  number: number;
  status: ThreadStatus;
  x: number;
  y: number;
  active?: boolean;
  pending?: boolean;
  onSelect: () => void;
}

function toneClass(status: ThreadStatus, pending: boolean): string {
  if (pending) {
    return "border-2 border-dashed border-blue-700 bg-white text-blue-700";
  }
  return status === "resolved"
    ? "border-2 border-white bg-neutral-600 text-white"
    : "border-2 border-white bg-blue-700 text-white";
}

export function Pin({ number, status, x, y, active = false, pending = false, onSelect }: PinProps) {
  const state = pending ? "pending" : status;
  return (
    <button
      type="button"
      aria-label={`Thread ${String(number)}, ${state}`}
      aria-haspopup="dialog"
      aria-expanded={active}
      data-state={state}
      onClick={onSelect}
      style={{ left: x - PIN_SIZE / 2, top: y - PIN_SIZE / 2, width: PIN_SIZE, height: PIN_SIZE }}
      className={`pointer-events-auto absolute box-border flex cursor-pointer items-center justify-center rounded-full font-sans text-xs leading-none font-semibold shadow-md motion-safe:transition-transform motion-safe:hover:scale-110 ${toneClass(status, pending)} ${active ? "ring-2 ring-blue-700 ring-offset-2" : ""} ${FOCUS_RING}`}
    >
      {number}
    </button>
  );
}
