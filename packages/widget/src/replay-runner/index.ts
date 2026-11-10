import type { RecordingStep, ReplayMode } from "@sitenote/core";
import type { ReplayBarStatus } from "@sitenote/ui";

export interface ReplayProgress {
  threadId: string;
  mode: ReplayMode;
  steps: RecordingStep[];
  nextIndex: number;
  at: number;
}

export interface ReplayProgressStore {
  load: () => Promise<ReplayProgress | null>;
  save: (progress: ReplayProgress) => Promise<void>;
  clear: () => Promise<void>;
}

export interface ReplayView {
  mode: ReplayMode;
  index: number;
  total: number;
  status: ReplayBarStatus;
  label: string;
  message?: string;
  target: Element | null;
}

export interface ReplayTiming {
  elementTimeoutMs: number;
  pollMs: number;
  settleQuietMs: number;
  settleMaxMs: number;
  navigateTimeoutMs: number;
  minPaceMs: number;
  maxPaceMs: number;
  stableMaxMs: number;
  progressTtlMs: number;
}

export const DEFAULT_REPLAY_TIMING: ReplayTiming = {
  elementTimeoutMs: 20_000,
  pollMs: 100,
  settleQuietMs: 700,
  settleMaxMs: 15_000,
  navigateTimeoutMs: 20_000,
  minPaceMs: 700,
  maxPaceMs: 3_000,
  stableMaxMs: 2_000,
  progressTtlMs: 600_000,
};

export interface ReplayRunnerDeps {
  doc: Document;
  win: Window;
  store: ReplayProgressStore;
  now: () => number;
  onChange: (view: ReplayView | null) => void;
  timing?: Partial<ReplayTiming>;
}

export interface ReplayRunner {
  start: (threadId: string, steps: readonly RecordingStep[], mode: ReplayMode) => void;
  resumeSaved: () => Promise<boolean>;
  next: () => void;
  back: () => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  retry: () => void;
  stop: () => void;
  detach: () => void;
  active: () => boolean;
}

type Action = "next" | "back" | "resume" | "skip" | "retry";

interface Jump {
  jumpTo: number;
  label: string;
}

type Located = Element | true | Jump;

const INPUT_MESSAGE = "Fill in this field yourself, then continue.";
const ELEMENT_MISSING_MESSAGE = "Could not find this element on the page.";
const NAVIGATE_MISSING_MESSAGE = "The page did not open as recorded.";
const DONE_LABEL = "Replay finished";

function stepLabel(step: RecordingStep): string {
  const candidates = [step.kind === "navigate" ? step.url : undefined, step.label, step.selector];
  return candidates.find((text) => text !== undefined && text !== "") ?? "";
}

function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

function paceMs(
  timing: ReplayTiming,
  step: RecordingStep,
  previous: RecordingStep | undefined,
): number {
  const gap = previous === undefined ? timing.minPaceMs : step.t - previous.t;
  return Math.min(timing.maxPaceMs, Math.max(timing.minPaceMs, gap));
}

function rectKey(element: Element): string {
  const rect = element.getBoundingClientRect();
  return `${String(rect.x)},${String(rect.y)},${String(rect.width)},${String(rect.height)}`;
}

function onAbort(signal: AbortSignal, handler: () => void): () => void {
  signal.addEventListener("abort", handler, { once: true });
  return () => {
    signal.removeEventListener("abort", handler);
  };
}

async function attempt(task: () => Promise<unknown>): Promise<void> {
  try {
    await task();
  } catch {
    return;
  }
}

async function attemptValue<T>(task: () => Promise<T>): Promise<T | null> {
  try {
    return await task();
  } catch {
    return null;
  }
}

export function createReplayRunner(deps: ReplayRunnerDeps): ReplayRunner {
  const { doc, win, store, now, onChange } = deps;
  const timing: ReplayTiming = { ...DEFAULT_REPLAY_TIMING, ...deps.timing };
  let controller: AbortController | null = null;
  let epoch = 0;
  let decide: ((action: Action) => void) | null = null;
  let mode: ReplayMode = "step";
  let threadId = "";
  let steps: RecordingStep[] = [];
  let index = 0;
  let paused = false;

  function invalidate(): void {
    epoch += 1;
    controller?.abort();
    controller = null;
    decide = null;
  }

  function answer(action: Action): void {
    const resolve = decide;
    decide = null;
    resolve?.(action);
  }

  function ask(signal: AbortSignal): Promise<Action | null> {
    return new Promise((resolve) => {
      const detach = onAbort(signal, () => {
        resolve(null);
      });
      decide = (action) => {
        detach();
        resolve(action);
      };
    });
  }

  async function awaitAction(
    signal: AbortSignal,
    accepted: readonly Action[],
  ): Promise<Action | null> {
    let action = await ask(signal);
    while (action !== null && !isAborted(signal) && !accepted.includes(action)) {
      action = await ask(signal);
    }
    return isAborted(signal) ? null : action;
  }

  function waitFor<T>(
    signal: AbortSignal,
    probe: () => T | null,
    timeoutMs: number,
  ): Promise<T | null> {
    return new Promise((resolve) => {
      const observer = new MutationObserver(check);
      const poll = win.setInterval(check, timing.pollMs);
      const timer = win.setTimeout(() => {
        finish(null);
      }, timeoutMs);
      const detach = onAbort(signal, () => {
        finish(null);
      });
      function finish(value: T | null): void {
        observer.disconnect();
        win.clearInterval(poll);
        win.clearTimeout(timer);
        detach();
        resolve(value);
      }
      function check(): void {
        const found = probe();
        if (found !== null) {
          finish(found);
        }
      }
      check();
    });
  }

  function delay(signal: AbortSignal, ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = win.setTimeout(finish, ms);
      const detach = onAbort(signal, finish);
      function finish(): void {
        win.clearTimeout(timer);
        detach();
        resolve();
      }
    });
  }

  function resourceCount(): number {
    const performance = win.performance as Performance | undefined;
    return performance === undefined ? 0 : performance.getEntriesByType("resource").length;
  }

  function pageBusy(): boolean {
    return (
      doc.querySelector('[aria-busy="true"]') !== null ||
      Array.from(doc.querySelectorAll('[role="progressbar"]')).some(
        (element) => element.getClientRects().length > 0,
      )
    );
  }

  function observeResources(onEntry: () => void): PerformanceObserver | null {
    const Observer = (win as Window & typeof globalThis).PerformanceObserver as
      typeof PerformanceObserver | undefined;
    if (typeof Observer === "undefined") {
      return null;
    }
    try {
      const resourceObserver = new Observer(onEntry);
      resourceObserver.observe({ type: "resource" });
      return resourceObserver;
    } catch {
      return null;
    }
  }

  function settle(signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const observer = new MutationObserver(restartQuiet);
      const cap = win.setTimeout(finish, timing.settleMaxMs);
      const resourceObserver = observeResources(restartQuiet);
      const poll =
        resourceObserver === null ? win.setInterval(watchResources, timing.pollMs) : undefined;
      let quiet = win.setTimeout(checkQuiet, timing.settleQuietMs);
      let resources = resourceCount();
      const detach = onAbort(signal, finish);
      observer.observe(doc, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
      function finish(): void {
        observer.disconnect();
        resourceObserver?.disconnect();
        win.clearTimeout(cap);
        win.clearInterval(poll);
        win.clearTimeout(quiet);
        detach();
        resolve();
      }
      function restartQuiet(): void {
        win.clearTimeout(quiet);
        quiet = win.setTimeout(checkQuiet, timing.settleQuietMs);
      }
      function watchResources(): void {
        const count = resourceCount();
        if (count !== resources) {
          resources = count;
          restartQuiet();
        }
      }
      function checkQuiet(): void {
        if (doc.readyState === "complete" && !pageBusy()) {
          finish();
        } else {
          restartQuiet();
        }
      }
    });
  }

  function waitStable(signal: AbortSignal, element: Element): Promise<void> {
    return new Promise((resolve) => {
      let previous = "";
      let frame = 0;
      const deadline = win.setTimeout(finish, timing.stableMaxMs);
      const detach = onAbort(signal, finish);
      function finish(): void {
        win.clearTimeout(deadline);
        win.cancelAnimationFrame(frame);
        detach();
        resolve();
      }
      function tick(): void {
        const current = rectKey(element);
        if (current === previous) {
          finish();
          return;
        }
        previous = current;
        frame = win.requestAnimationFrame(tick);
      }
      frame = win.requestAnimationFrame(tick);
    });
  }

  function nextFrame(): Promise<void> {
    return new Promise((resolve) => {
      win.requestAnimationFrame(() => {
        resolve();
      });
    });
  }

  function whenLoaded(): Promise<void> {
    if (doc.readyState === "complete") {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      win.addEventListener(
        "load",
        () => {
          resolve();
        },
        { once: true },
      );
    });
  }

  function routeReached(url: string | undefined): boolean {
    if (url === undefined) {
      return true;
    }
    const target = URL.parse(url, win.location.href);
    return (
      target !== null &&
      target.pathname + target.search === win.location.pathname + win.location.search
    );
  }

  function findVisible(selector: string): Element | null {
    let element: Element | null;
    try {
      element = doc.querySelector(selector);
    } catch {
      return null;
    }
    if (element === null || element.getClientRects().length === 0) {
      return null;
    }
    return win.getComputedStyle(element).visibility === "hidden" ? null : element;
  }

  function reachedAhead(): { index: number; step: RecordingStep } | null {
    for (let at = index + 1; at < steps.length; at += 1) {
      const candidate = steps[at];
      if (
        candidate?.kind === "navigate" &&
        candidate.url !== undefined &&
        routeReached(candidate.url)
      ) {
        return { index: at, step: candidate };
      }
    }
    return null;
  }

  function locate(step: RecordingStep): Located | null {
    if (step.kind === "navigate") {
      return routeReached(step.url) ? true : null;
    }
    const element = findVisible(step.selector);
    if (element !== null) {
      return element;
    }
    const ahead = reachedAhead();
    return ahead === null ? null : { jumpTo: ahead.index, label: stepLabel(ahead.step) };
  }

  function publish(
    signal: AbortSignal,
    status: ReplayBarStatus,
    label: string,
    target: Element | null,
    message?: string,
  ): void {
    if (isAborted(signal)) {
      return;
    }
    const view: ReplayView = {
      mode,
      index: status === "done" ? Math.max(0, steps.length - 1) : index,
      total: steps.length,
      status,
      label,
      target,
      ...(message === undefined ? {} : { message }),
    };
    onChange(view);
  }

  function performClick(element: Element): void {
    const init = { bubbles: true, cancelable: true, composed: true };
    element.dispatchEvent(new PointerEvent("pointerdown", init));
    element.dispatchEvent(new MouseEvent("mousedown", init));
    element.dispatchEvent(new PointerEvent("pointerup", init));
    element.dispatchEvent(new MouseEvent("mouseup", init));
    if (element instanceof HTMLElement) {
      element.click();
    } else {
      element.dispatchEvent(new MouseEvent("click", init));
    }
  }

  function performSubmit(element: Element): void {
    const form = element.closest("form");
    if (form !== null) {
      try {
        form.requestSubmit();
      } catch {
        form.submit();
      }
      return;
    }
    const init = { key: "Enter", bubbles: true, cancelable: true, composed: true };
    element.dispatchEvent(new KeyboardEvent("keydown", init));
    element.dispatchEvent(new KeyboardEvent("keyup", init));
  }

  async function drive(signal: AbortSignal): Promise<void> {
    await settle(signal);
    if (isAborted(signal)) {
      return;
    }
    while (index < steps.length) {
      const step = steps[index];
      if (step === undefined) {
        break;
      }
      const label = stepLabel(step);
      const isNavigate = step.kind === "navigate";
      publish(signal, "waiting", label, null);
      const found = await waitFor(
        signal,
        () => locate(step),
        isNavigate ? timing.navigateTimeoutMs : timing.elementTimeoutMs,
      );
      if (isAborted(signal)) {
        return;
      }
      if (found === null) {
        publish(
          signal,
          "missing",
          label,
          null,
          isNavigate ? NAVIGATE_MISSING_MESSAGE : ELEMENT_MISSING_MESSAGE,
        );
        const action = await awaitAction(signal, ["retry", "skip"]);
        if (action === null) {
          return;
        }
        if (action === "skip") {
          index += 1;
        }
        continue;
      }
      if (found === true) {
        index += 1;
        continue;
      }
      if (!(found instanceof Element)) {
        index = found.jumpTo;
        publish(
          signal,
          "waiting",
          found.label,
          null,
          `The page is already further. Skipped to step ${String(found.jumpTo + 1)}.`,
        );
        continue;
      }
      found.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: win.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
      await nextFrame();
      if (isAborted(signal)) {
        return;
      }
      await waitStable(signal, found);
      if (isAborted(signal)) {
        return;
      }
      if (step.kind === "input") {
        publish(signal, "input", label, found, INPUT_MESSAGE);
        if (found instanceof HTMLElement) {
          found.focus({ preventScroll: true });
        }
        const action = await awaitAction(signal, ["next", "resume", "back"]);
        if (action === null) {
          return;
        }
        index = action === "back" ? Math.max(0, index - 1) : index + 1;
        continue;
      }
      if (mode === "step") {
        publish(signal, "ready", label, found);
        const action = await awaitAction(signal, ["next", "back"]);
        if (action === null) {
          return;
        }
        if (action === "back") {
          index = Math.max(0, index - 1);
          continue;
        }
      } else {
        publish(signal, "running", label, found);
        await delay(signal, paceMs(timing, step, steps[index - 1]));
        if (isAborted(signal)) {
          return;
        }
        while (paused) {
          publish(signal, "ready", label, found);
          if ((await awaitAction(signal, ["resume"])) === null) {
            return;
          }
        }
      }
      await attempt(() => store.save({ threadId, mode, steps, nextIndex: index + 1, at: now() }));
      if (isAborted(signal)) {
        return;
      }
      if (step.kind === "submit") {
        performSubmit(found);
      } else {
        performClick(found);
      }
      await settle(signal);
      if (isAborted(signal)) {
        return;
      }
      index += 1;
    }
    if (isAborted(signal)) {
      return;
    }
    publish(signal, "done", DONE_LABEL, null);
    await attempt(() => store.clear());
  }

  function launch(
    nextThreadId: string,
    nextSteps: readonly RecordingStep[],
    nextMode: ReplayMode,
    nextIndex: number,
  ): void {
    invalidate();
    threadId = nextThreadId;
    steps = [...nextSteps];
    mode = nextMode;
    index = nextIndex;
    paused = false;
    const next = new AbortController();
    controller = next;
    void drive(next.signal);
  }

  async function resumeSaved(): Promise<boolean> {
    if (controller !== null) {
      return false;
    }
    const before = epoch;
    const saved = await attemptValue(() => store.load());
    if (saved === null || epoch !== before || saved.at + timing.progressTtlMs < now()) {
      return false;
    }
    if (
      saved.nextIndex >= saved.steps.length ||
      saved.steps[saved.nextIndex]?.kind !== "navigate"
    ) {
      await attempt(() => store.clear());
      return false;
    }
    await whenLoaded();
    if (epoch !== before) {
      return false;
    }
    launch(saved.threadId, saved.steps, saved.mode, saved.nextIndex);
    return true;
  }

  return {
    start: (nextThreadId, nextSteps, nextMode) => {
      launch(nextThreadId, nextSteps, nextMode, 0);
    },
    resumeSaved,
    next: () => {
      answer("next");
    },
    back: () => {
      if (mode === "step") {
        answer("back");
      }
    },
    pause: () => {
      if (mode === "auto") {
        paused = true;
      }
    },
    resume: () => {
      paused = false;
      answer("resume");
    },
    skip: () => {
      answer("skip");
    },
    retry: () => {
      answer("retry");
    },
    stop: () => {
      invalidate();
      onChange(null);
      void attempt(() => store.clear());
    },
    detach: () => {
      invalidate();
    },
    active: () => controller !== null,
  };
}
