import type { ReplayMode } from "@sitenote/core";

import { PANEL_SURFACE, PRIMARY_BUTTON, SECONDARY_BUTTON } from "../control-classes";
import type { AnchorRect } from "../placement";
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
  inputRect?: AnchorRect | null | undefined;
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
    <button type="button" onClick={onStop} aria-keyshortcuts="Escape" className={SECONDARY_BUTTON}>
      Stop replay
    </button>
  );
  if (status === "done") {
    return (
      <button type="button" onClick={onStop} className={PRIMARY_BUTTON}>
        Close
      </button>
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
    if (status === "waiting") {
      return stop;
    }
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

function inputOpening(rect: AnchorRect | null | undefined): string | undefined {
  if (rect === null || rect === undefined) {
    return undefined;
  }
  const left = `${String(rect.x)}px`;
  const top = `${String(rect.y)}px`;
  const right = `${String(rect.x + rect.width)}px`;
  const bottom = `${String(rect.y + rect.height)}px`;
  return `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${left} ${top}, ${left} ${bottom}, ${right} ${bottom}, ${right} ${top}, ${left} ${top})`;
}

export function ReplayBar(props: ReplayBarProps) {
  const { mode, index, total, status, label, message, inputRect } = props;
  const controllingPage = status !== "done";
  return (
    <>
      {controllingPage ? (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-auto fixed inset-0 cursor-not-allowed"
            style={{ zIndex: Z_INDEX.replayShield, clipPath: inputOpening(inputRect) }}
          />
          <div
            aria-hidden="true"
            data-testid="sitenote-replay-frame"
            className="pointer-events-none fixed inset-0 box-border border-4 border-blue-600"
            style={{
              zIndex: Z_INDEX.replayShield,
              borderImage: "linear-gradient(125deg, #38bdf8, #2563eb 36%, #7c3aed 68%, #c084fc) 1",
            }}
          />
        </>
      ) : null}
      <div
        role="region"
        aria-label="Replay controls"
        data-sitenote-replay-controls=""
        style={{ zIndex: Z_INDEX.replayControls }}
        className={`pointer-events-auto fixed bottom-4 left-1/2 w-[32rem] max-w-[calc(100vw-32px)] -translate-x-1/2 p-3 ${PANEL_SURFACE}`}
      >
        {controllingPage ? (
          <p className="mb-1 text-xs font-semibold text-blue-800">
            Sitenote is controlling this page
          </p>
        ) : null}
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
          {status === "waiting" ? (
            <span
              aria-hidden="true"
              data-testid="replay-spinner"
              className="mr-1.5 inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent align-middle motion-reduce:animate-none"
            />
          ) : null}
          {label}
        </p>
        {message === undefined ? null : <p className="break-words text-neutral-600">{message}</p>}
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <ReplayActions {...props} />
        </div>
      </div>
    </>
  );
}
