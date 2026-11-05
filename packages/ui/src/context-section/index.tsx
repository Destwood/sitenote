import {
  stepsToPlaywright,
  type ConsoleErrorRecord,
  type RecordingRef,
  type RecordingStep,
  type ThreadContext,
} from "@sitenote/core";
import { useEffect, useId, useState } from "react";

import { FOCUS_RING, SECONDARY_BUTTON } from "../control-classes";
import type { ScreenshotState } from "../types";

export const CONTEXT_UNAVAILABLE_TEXT = "Context unavailable";

const COPY_FEEDBACK_MS = 2000;

export interface ContextSectionProps {
  context: ThreadContext | null;
  hasScreenshot: boolean;
  screenshot?: ScreenshotState | undefined;
  recording?: ScreenshotState | undefined;
  onReplaySteps?: (() => void) | undefined;
}

export function formatViewport(context: ThreadContext): string {
  const ratio = Number(context.devicePixelRatio.toFixed(2));
  return `${String(context.viewport.width)}×${String(context.viewport.height)} @${String(ratio)}x`;
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1000);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${String(Math.floor(totalSeconds / 60))}:${seconds}`;
}

export function formatSizeMb(size: number): string {
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatSystem(name: string, version: string | undefined): string {
  return version === undefined || version === "" ? name : `${name} ${version}`;
}

export function safeScreenshotUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

const KIND_LABELS: Readonly<Record<ConsoleErrorRecord["kind"], string>> = {
  error: "Uncaught error",
  unhandledrejection: "Unhandled rejection",
  "console.error": "console.error",
};

function formatLocation(record: ConsoleErrorRecord): string | null {
  if (record.source === undefined) {
    return null;
  }
  const line = record.line === undefined ? "" : `:${String(record.line)}`;
  const column =
    record.line !== undefined && record.column !== undefined ? `:${String(record.column)}` : "";
  return `${record.source}${line}${column}`;
}

interface ScreenshotLinkProps {
  url: string;
}

function ScreenshotLink({ url }: ScreenshotLinkProps) {
  const [failed, setFailed] = useState(false);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open the full screenshot in a new tab"
      className={`block rounded-md border border-neutral-200 ${FOCUS_RING}`}
    >
      {failed ? (
        <span className="block px-2 py-1 font-medium underline underline-offset-2">
          Open screenshot
        </span>
      ) : (
        <img
          src={url}
          alt="Screenshot of the commented area"
          referrerPolicy="no-referrer"
          onError={() => {
            setFailed(true);
          }}
          className="max-h-40 w-full rounded-md bg-neutral-100 object-contain"
        />
      )}
    </a>
  );
}

function ScreenshotBlock({
  hasScreenshot,
  screenshot,
}: Pick<ContextSectionProps, "hasScreenshot" | "screenshot">) {
  if (!hasScreenshot) {
    return <p className="text-neutral-600">No screenshot saved.</p>;
  }
  if (screenshot === undefined || screenshot.status === "loading") {
    return (
      <p role="status" className="text-neutral-600">
        Loading screenshot…
      </p>
    );
  }
  const url = screenshot.status === "ready" ? safeScreenshotUrl(screenshot.url) : null;
  return url === null ? (
    <p className="text-neutral-600">Screenshot could not be loaded.</p>
  ) : (
    <ScreenshotLink url={url} />
  );
}

interface RecordingBlockProps {
  recording: RecordingRef;
  state: ScreenshotState | undefined;
}

function RecordingBlock({ recording, state }: RecordingBlockProps) {
  if (state === undefined || state.status === "loading") {
    return (
      <p role="status" className="text-neutral-600">
        Loading video...
      </p>
    );
  }
  const url = state.status === "ready" ? safeScreenshotUrl(state.url) : null;
  return (
    <div className="space-y-1">
      {url === null ? (
        <p className="text-neutral-600">Video could not be loaded.</p>
      ) : (
        <video
          aria-label="Screen recording"
          controls
          preload="metadata"
          src={url}
          className="max-h-48 w-full rounded-md bg-black"
        />
      )}
      <p className="text-neutral-600">
        {formatDuration(recording.durationMs)} · {formatSizeMb(recording.size)}
      </p>
    </div>
  );
}

const STEP_KIND_LABELS: Readonly<Record<RecordingStep["kind"], string>> = {
  click: "Click",
  input: "Field changed",
  submit: "Form submitted",
  navigate: "Page opened",
};

const COPY_LABELS = {
  idle: "Copy as Playwright",
  copied: "Copied",
  failed: "Copy failed",
} as const;

function stepText(step: RecordingStep): string {
  const text = step.kind === "navigate" ? (step.url ?? "") : step.label;
  return text === "" ? step.selector : text;
}

interface RecordingStepsBlockProps {
  steps: readonly RecordingStep[];
  pageUrl: string;
  onReplaySteps: (() => void) | undefined;
}

function RecordingStepsBlock({ steps, pageUrl, onReplaySteps }: RecordingStepsBlockProps) {
  const headingId = useId();
  const [copyState, setCopyState] = useState<keyof typeof COPY_LABELS>("idle");

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

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(stepsToPlaywright(pageUrl, steps));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="space-y-2">
      <p id={headingId} className="font-medium text-neutral-900">
        What the reporter did ({String(steps.length)})
      </p>
      <ol
        aria-labelledby={headingId}
        tabIndex={0}
        className={`max-h-40 overflow-y-auto rounded-md border border-neutral-200 ${FOCUS_RING}`}
      >
        {steps.map((step, index) => {
          const text = stepText(step);
          return (
            <li
              key={`${String(step.t)}:${String(index)}`}
              className="flex min-w-0 items-baseline gap-2 border-t border-neutral-100 px-2 py-1.5 first:border-t-0"
            >
              <span className="shrink-0 font-mono text-neutral-600">{formatDuration(step.t)}</span>
              <span className="shrink-0 rounded-sm bg-neutral-100 px-1 text-neutral-700">
                {STEP_KIND_LABELS[step.kind]}
              </span>
              <span title={text} className="min-w-0 truncate">
                {text}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            void copyScript();
          }}
          className={SECONDARY_BUTTON}
        >
          {COPY_LABELS[copyState]}
        </button>
        {onReplaySteps === undefined ? null : (
          <button
            type="button"
            onClick={() => {
              onReplaySteps();
            }}
            className={SECONDARY_BUTTON}
          >
            Replay on page
          </button>
        )}
      </div>
    </div>
  );
}

interface ErrorItemProps {
  record: ConsoleErrorRecord;
}

function ErrorItem({ record }: ErrorItemProps) {
  const location = formatLocation(record);
  return (
    <li className="space-y-1 border-t border-neutral-100 px-2 py-1.5 first:border-t-0">
      <p className="font-medium text-neutral-900">{KIND_LABELS[record.kind]}</p>
      <p className="font-mono break-words whitespace-pre-wrap">{record.message}</p>
      {location === null ? null : <p className="break-all text-neutral-600">{location}</p>}
      {record.stack === undefined ? null : (
        <details>
          <summary className={`cursor-pointer rounded-sm font-medium ${FOCUS_RING}`}>Stack</summary>
          <pre className="mt-1 max-h-32 overflow-auto font-mono break-all whitespace-pre-wrap">
            {record.stack}
          </pre>
        </details>
      )}
    </li>
  );
}

interface ConsoleErrorsProps {
  records: readonly ConsoleErrorRecord[];
}

function ConsoleErrors({ records }: ConsoleErrorsProps) {
  if (records.length === 0) {
    return <p className="text-neutral-600">No console errors.</p>;
  }
  return (
    <details className="rounded-md border border-neutral-200">
      <summary className={`cursor-pointer rounded-md px-2 py-1 font-medium ${FOCUS_RING}`}>
        Console errors ({records.length})
      </summary>
      <ul className="max-h-60 overflow-y-auto border-t border-neutral-200">
        {records.map((record, index) => (
          <ErrorItem key={`${record.at}:${String(index)}`} record={record} />
        ))}
      </ul>
    </details>
  );
}

interface DetailsProps {
  context: ThreadContext;
}

function Details({ context }: DetailsProps) {
  return (
    <>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt className="font-medium text-neutral-900">Viewport</dt>
        <dd>{formatViewport(context)}</dd>
        <dt className="font-medium text-neutral-900">Browser</dt>
        <dd className="break-words">
          {formatSystem(context.browser.name, context.browser.version)}
        </dd>
        <dt className="font-medium text-neutral-900">System</dt>
        <dd className="break-words">{formatSystem(context.os.name, context.os.version)}</dd>
        <dt className="font-medium text-neutral-900">Page title</dt>
        <dd className="break-words">{context.pageTitle === "" ? "Untitled" : context.pageTitle}</dd>
      </dl>
      <ConsoleErrors records={context.consoleErrors} />
    </>
  );
}

export function ContextSection({
  context,
  hasScreenshot,
  screenshot,
  recording,
  onReplaySteps,
}: ContextSectionProps) {
  const steps = context?.recording?.steps ?? [];
  return (
    <section
      aria-label="Page context"
      className="space-y-2 border-t border-neutral-100 py-3 text-xs text-neutral-700"
    >
      <ScreenshotBlock hasScreenshot={hasScreenshot} screenshot={screenshot} />
      {context?.recording === undefined ? null : (
        <RecordingBlock recording={context.recording} state={recording} />
      )}
      {context === null || steps.length === 0 ? null : (
        <RecordingStepsBlock steps={steps} pageUrl={context.url} onReplaySteps={onReplaySteps} />
      )}
      {context === null ? (
        <p className="text-neutral-600">{CONTEXT_UNAVAILABLE_TEXT}</p>
      ) : (
        <Details context={context} />
      )}
    </section>
  );
}
