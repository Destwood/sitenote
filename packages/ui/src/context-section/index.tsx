import {
  isRecordedAction,
  stepsToPlaywright,
  type ConsoleErrorRecord,
  type NetworkErrorRecord,
  type RecordingRef,
  type RecordedAction,
  type RecordingStep,
  type ReplayMode,
  type ThreadContext,
} from "@sitenote/core";
import { useEffect, useId, useState, type KeyboardEvent } from "react";

import { FOCUS_RING, SECONDARY_BUTTON } from "../control-classes";
import { ReplayButton } from "../replay-button";
import type { ScreenshotState } from "../types";

export const CONTEXT_UNAVAILABLE_TEXT = "Context unavailable";

const COPY_FEEDBACK_MS = 2000;

export interface ContextSectionProps {
  context: ThreadContext | null;
  hasScreenshot: boolean;
  screenshot?: ScreenshotState | undefined;
  recording?: ScreenshotState | undefined;
  largeVideo?: boolean | undefined;
  onReplaySteps?: ((mode: ReplayMode) => void) | undefined;
  onCopyContext?: (() => Promise<boolean> | boolean) | undefined;
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

export function formatTimeUtc(at: string): string {
  return `${new Date(at).toISOString().slice(11, 19)} UTC`;
}

export function formatRequestStatus(status: number): string {
  return status === 0 ? "Failed" : String(status);
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
  largeVideo?: boolean | undefined;
}

function RecordingBlock({ recording, state, largeVideo }: RecordingBlockProps) {
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
          className={`${largeVideo === true ? "max-h-[28rem]" : "max-h-48"} w-full rounded-md bg-black`}
        />
      )}
      <div className="flex flex-wrap items-baseline gap-x-2 text-neutral-600">
        <span>
          {formatDuration(recording.durationMs)} · {formatSizeMb(recording.size)}
        </span>
        {url === null ? null : (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`rounded-sm font-medium text-neutral-900 underline underline-offset-2 ${FOCUS_RING}`}
          >
            Open video
          </a>
        )}
      </div>
    </div>
  );
}

const STEP_KIND_LABELS: Readonly<Record<RecordedAction["kind"], string>> = {
  click: "Click",
  input: "Field changed",
  submit: "Form submitted",
};

const COPY_LABELS = {
  idle: "Copy as Playwright",
  copied: "Copied",
  failed: "Copy failed",
} as const;

interface RecordingStepsBlockProps {
  actions: readonly RecordedAction[];
  steps: readonly RecordingStep[];
  pageUrl: string;
  onReplaySteps: ((mode: ReplayMode) => void) | undefined;
}

function RecordingStepsBlock({ actions, steps, pageUrl, onReplaySteps }: RecordingStepsBlockProps) {
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
      <div className="space-y-1">
        <p id={headingId} className="font-medium text-neutral-900">
          What the reporter did ({String(actions.length)})
        </p>
        <p className="text-neutral-600">
          Open the page where the recording started, then play the steps.
        </p>
      </div>
      <ol
        aria-labelledby={headingId}
        tabIndex={0}
        className={`max-h-56 overflow-y-auto rounded-md border border-neutral-200 ${FOCUS_RING}`}
      >
        {actions.map((step, index) => {
          const text = step.label === "" ? step.selector : step.label;
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
          <ReplayButton onReplay={onReplaySteps} label="Reproduce" />
        )}
      </div>
    </div>
  );
}

type RecordingTab = "screenshot" | "steps";

interface RecordingTabsProps {
  hasScreenshot: boolean;
  screenshot: ScreenshotState | undefined;
  steps: readonly RecordingStep[];
  pageUrl: string;
  onReplaySteps: ((mode: ReplayMode) => void) | undefined;
}

function RecordingTabs({
  hasScreenshot,
  screenshot,
  steps,
  pageUrl,
  onReplaySteps,
}: RecordingTabsProps) {
  const id = useId();
  const [tab, setTab] = useState<RecordingTab>("screenshot");
  const panelId = `${id}-panel`;
  const actions = steps.filter(isRecordedAction);
  const tabIdOf = (value: RecordingTab) => `${id}-tab-${value}`;
  const tabs = [
    { value: "screenshot", label: "Screenshot" },
    { value: "steps", label: `Steps (${String(actions.length)})` },
  ] as const;

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const next: RecordingTab = tab === "screenshot" ? "steps" : "screenshot";
    setTab(next);
    document.getElementById(tabIdOf(next))?.focus();
  }

  return (
    <div className="space-y-2">
      <div
        role="tablist"
        aria-label="Recording details"
        className="grid grid-cols-2 border-b border-neutral-200"
      >
        {tabs.map(({ value, label }) => {
          const selected = tab === value;
          return (
            <button
              key={value}
              id={tabIdOf(value)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                setTab(value);
              }}
              onKeyDown={onTabKeyDown}
              className={`h-8 border-b-2 text-xs ${FOCUS_RING} ${selected ? "border-blue-600 font-semibold text-neutral-900" : "border-transparent text-neutral-600 hover:text-neutral-900"}`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={tabIdOf(tab)}>
        {tab === "screenshot" ? (
          <ScreenshotBlock hasScreenshot={hasScreenshot} screenshot={screenshot} />
        ) : actions.length === 0 ? (
          <p className="text-neutral-600">No steps were recorded for this video.</p>
        ) : (
          <RecordingStepsBlock
            actions={actions}
            steps={steps}
            pageUrl={pageUrl}
            onReplaySteps={onReplaySteps}
          />
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
      {record.at === undefined ? null : (
        <p className="text-neutral-600">{formatTimeUtc(record.at)}</p>
      )}
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
          <ErrorItem key={`${String(record.at)}:${String(index)}`} record={record} />
        ))}
      </ul>
    </details>
  );
}

interface NetworkErrorItemProps {
  record: NetworkErrorRecord;
}

function NetworkErrorItem({ record }: NetworkErrorItemProps) {
  return (
    <li className="space-y-1 border-t border-neutral-100 px-2 py-1.5 first:border-t-0">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 font-mono font-semibold text-neutral-900">{record.method}</span>
        <span className="min-w-0 font-mono break-all">{record.url}</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-2 text-neutral-600">
        <span className="rounded-sm bg-red-100 px-1 font-medium text-red-900">
          {formatRequestStatus(record.status)}
        </span>
        {record.at === undefined ? null : <span>{formatTimeUtc(record.at)}</span>}
      </div>
    </li>
  );
}

interface NetworkErrorsProps {
  records: readonly NetworkErrorRecord[];
}

function NetworkErrors({ records }: NetworkErrorsProps) {
  if (records.length === 0) {
    return null;
  }
  return (
    <details className="rounded-md border border-neutral-200">
      <summary className={`cursor-pointer rounded-md px-2 py-1 font-medium ${FOCUS_RING}`}>
        Failed requests ({records.length})
      </summary>
      <ul className="max-h-60 overflow-y-auto border-t border-neutral-200">
        {records.map((record, index) => (
          <NetworkErrorItem key={`${String(index)}:${record.url}`} record={record} />
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
      <NetworkErrors records={context.networkErrors ?? []} />
      <ConsoleErrors records={context.consoleErrors} />
    </>
  );
}

const COPY_CONTEXT_LABELS = {
  idle: "Copy context",
  copied: "Copied",
  failed: "Could not copy",
} as const;

export interface CopyContextButtonProps {
  onCopyContext: () => Promise<boolean> | boolean;
}

export function CopyContextButton({ onCopyContext }: CopyContextButtonProps) {
  const [copyState, setCopyState] = useState<keyof typeof COPY_CONTEXT_LABELS>("idle");

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

  async function copyContext() {
    try {
      setCopyState((await onCopyContext()) ? "copied" : "failed");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div role="status" className="flex justify-end">
      <button
        type="button"
        onClick={() => {
          void copyContext();
        }}
        className={SECONDARY_BUTTON}
      >
        {COPY_CONTEXT_LABELS[copyState]}
      </button>
    </div>
  );
}

export function ContextSection({
  context,
  hasScreenshot,
  screenshot,
  recording,
  largeVideo,
  onReplaySteps,
  onCopyContext,
}: ContextSectionProps) {
  return (
    <section
      aria-label="Page context"
      className="space-y-2 border-t border-neutral-100 py-3 text-xs text-neutral-700"
    >
      {onCopyContext === undefined ? null : <CopyContextButton onCopyContext={onCopyContext} />}
      {context?.recording === undefined ? (
        <ScreenshotBlock hasScreenshot={hasScreenshot} screenshot={screenshot} />
      ) : (
        <>
          <RecordingTabs
            hasScreenshot={hasScreenshot}
            screenshot={screenshot}
            steps={context.recording.steps ?? []}
            pageUrl={context.url}
            onReplaySteps={onReplaySteps}
          />
          <RecordingBlock recording={context.recording} state={recording} largeVideo={largeVideo} />
        </>
      )}
      {context === null ? (
        <p className="text-neutral-600">{CONTEXT_UNAVAILABLE_TEXT}</p>
      ) : (
        <Details context={context} />
      )}
    </section>
  );
}
