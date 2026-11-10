import type { ReplayMode } from "@sitenote/core";

import { PANEL_SURFACE, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../control-classes";
import { REPLAY_MODE_LABELS } from "../replay-button";
import { Z_INDEX } from "../z-index";

export type ReplayBarStatus = "ready" | "running" | "waiting" | "input" | "missing" | "done";

export interface ReplayBarProps {
  mode: ReplayMode;
  index: number;
  total: number;
  status: ReplayBarStatus;
  label: string;
  message?: string | undefined;
  onBack: () => void;
  onNext: () => void;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onRetry: () => void;
  onStop: () => void;
}

function ReplayActions({
  mode,
  index,
  status,
  onBack,
  onNext,
  onPause,
  onResume,
  onSkip,
  onRetry,
  onStop,
}: ReplayBarProps) {
  const stop = (
    <button type="button" onClick={onStop} className={SECONDARY_BUTTON}>
      Stop
    </button>
  );
  if (status === "done") {
    return (
      <>
        <span className="mr-auto font-medium">Replay finished</span>
        <button type="button" onClick={onStop} className={PRIMARY_BUTTON}>
          Close
        </button>
      </>
    );
  }
  if (status === "missing") {
    return (
      <>
        <button type="button" onClick={onRetry} className={PRIMARY_BUTTON}>
          Retry
        </button>
        <button type="button" onClick={onSkip} className={SECONDARY_BUTTON}>
          Skip
        </button>
        {stop}
      </>
    );
  }
  if (mode === "step") {
    return (
      <>
        <button type="button" onClick={onBack} disabled={index === 0} className={SECONDARY_BUTTON}>
          Back
        </button>
        <button type="button" onClick={onNext} className={PRIMARY_BUTTON}>
          {status === "input" ? "Continue" : "Next"}
        </button>
        {stop}
      </>
    );
  }
  if (status === "running" || status === "waiting") {
    return (
      <>
        <button type="button" onClick={onPause} className={SECONDARY_BUTTON}>
          Pause
        </button>
        {stop}
      </>
    );
  }
  return (
    <>
      <button type="button" onClick={onResume} className={PRIMARY_BUTTON}>
        {status === "input" ? "Continue" : "Resume"}
      </button>
      {stop}
    </>
  );
}

export function ReplayBar(props: ReplayBarProps) {
  const { mode, index, total, label, message } = props;
  return (
    <div
      role="region"
      aria-label="Replay controls"
      style={{ zIndex: Z_INDEX.banner }}
      className={`fixed bottom-4 left-1/2 w-[32rem] max-w-[calc(100vw-32px)] -translate-x-1/2 p-3 ${PANEL_SURFACE}`}
    >
      <p aria-live="polite" className="sr-only">
        {message ?? label}
      </p>
      <p className="text-xs text-neutral-600">
        <span className="font-medium text-neutral-900">
          Step {String(index + 1)} of {String(total)}
        </span>
        {" · "}
        {REPLAY_MODE_LABELS[mode]}
      </p>
      <p className="truncate font-medium" title={label}>
        {label}
      </p>
      {message === undefined ? null : <p className="break-words text-neutral-600">{message}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <ReplayActions {...props} />
      </div>
    </div>
  );
}
