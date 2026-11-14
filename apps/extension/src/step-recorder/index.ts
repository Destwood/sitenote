import {
  SITENOTE_ROOT_TAG,
  buildCssSelector,
  sanitizeStep,
  type RecordingStep,
} from "@sitenote/core";

export interface StepRecorderDeps {
  doc: Document;
  win: Window;
  now: () => number;
  send: (step: RecordingStep) => void;
}

export interface StepRecorderOptions {
  announceNavigation: boolean;
}

export interface StepRecorder {
  start: (startedAt: number, options?: StepRecorderOptions) => void;
  stop: () => void;
  active: () => boolean;
}

type StepKind = RecordingStep["kind"];

const NAVIGATION_POLL_MS = 500;
const INTERACTIVE_SELECTOR =
  "a,button,input,select,textarea,summary,label,[role=button],[role=link],[role=menuitem],[role=tab],[role=checkbox],[role=switch],[onclick]";
const CLICKABLE_INPUT_TYPES: readonly string[] = [
  "button",
  "submit",
  "reset",
  "checkbox",
  "radio",
  "image",
];
const FIELD_TAGS: readonly string[] = ["input", "select", "textarea"];
const SENSITIVE_AUTOCOMPLETE = /(?:^|\s)cc-/;

function insideRoot(event: Event): boolean {
  return event
    .composedPath()
    .some((node) => node instanceof Element && node.localName === SITENOTE_ROOT_TAG);
}

function targetOf(event: Event): Element | null {
  const origin = event.composedPath()[0];
  if (origin instanceof Element) {
    return origin;
  }
  return origin instanceof Node ? origin.parentElement : null;
}

function acceptedTarget(event: Event): Element | null {
  if (!event.isTrusted || insideRoot(event)) {
    return null;
  }
  return targetOf(event);
}

function isEditableField(element: Element): boolean {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return true;
  }
  return element instanceof HTMLInputElement && !CLICKABLE_INPUT_TYPES.includes(element.type);
}

function hasActivationEvent(element: Element): boolean {
  if (element instanceof HTMLButtonElement) {
    return element.type === "submit" && element.form !== null;
  }
  return (
    element instanceof HTMLInputElement &&
    (element.type === "checkbox" ||
      element.type === "radio" ||
      (element.form !== null && (element.type === "submit" || element.type === "image")))
  );
}

function isSensitive(element: Element): boolean {
  return (
    (element instanceof HTMLInputElement && element.type === "password") ||
    SENSITIVE_AUTOCOMPLETE.test(element.getAttribute("autocomplete") ?? "")
  );
}

function selectorOf(element: Element): string {
  try {
    return buildCssSelector(element);
  } catch {
    return element.localName;
  }
}

function labelledByText(doc: Document, element: Element): string | null {
  const ids = (element.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
  if (ids.length === 0) {
    return null;
  }
  return ids.map((id) => doc.getElementById(id)?.textContent ?? "").join(" ");
}

function associatedLabelText(doc: Document, element: Element): string | null {
  const id = element.getAttribute("id");
  const explicit = id === null ? null : doc.querySelector(`label[for="${CSS.escape(id)}"]`);
  return (element.closest("label") ?? explicit)?.textContent ?? null;
}

function visibleText(element: Element): string | null {
  if (FIELD_TAGS.includes(element.localName)) {
    return null;
  }
  return element instanceof HTMLElement ? element.innerText : element.textContent;
}

function labelOf(doc: Document, element: Element): string {
  const fallbacks = isSensitive(element)
    ? []
    : [
        visibleText(element),
        element.getAttribute("title"),
        element.getAttribute("alt"),
        element.getAttribute("placeholder"),
        element.getAttribute("name"),
      ];
  const candidates = [
    element.getAttribute("aria-label"),
    labelledByText(doc, element),
    associatedLabelText(doc, element),
    ...fallbacks,
  ];
  return candidates.find((text) => text !== null && text.trim() !== "") ?? "";
}

export function createStepRecorder(deps: StepRecorderDeps): StepRecorder {
  let origin = 0;
  let cleanup: (() => void) | null = null;
  let lastHref = "";
  let clickedControl: Element | null = null;
  let activationTimer: number | undefined;

  function emit(fields: {
    kind: StepKind;
    selector: string;
    label: string;
    url?: string;
    sensitive?: boolean;
  }): void {
    deps.send(sanitizeStep({ t: deps.now() - origin, ...fields }));
  }

  function report(kind: StepKind, element: Element): void {
    checkNavigation();
    emit({
      kind,
      selector: selectorOf(element),
      label: labelOf(deps.doc, element),
      sensitive: isSensitive(element),
    });
  }

  function onClick(event: Event): void {
    const target = acceptedTarget(event);
    if (target === null) {
      return;
    }
    const element = target.closest(INTERACTIVE_SELECTOR) ?? target;
    if (
      isEditableField(element) ||
      (element instanceof HTMLLabelElement && element.control !== null)
    ) {
      return;
    }
    if (hasActivationEvent(element)) {
      deps.win.clearTimeout(activationTimer);
      clickedControl = element;
      activationTimer = deps.win.setTimeout(() => {
        clickedControl = null;
      }, 0);
    }
    report("click", element);
  }

  function onChange(event: Event): void {
    const target = acceptedTarget(event);
    if (target !== null && target !== clickedControl && FIELD_TAGS.includes(target.localName)) {
      report("input", target);
    }
  }

  function onSubmit(event: Event): void {
    const target = acceptedTarget(event);
    if (
      target !== null &&
      !(
        event instanceof SubmitEvent &&
        event.submitter === clickedControl &&
        clickedControl !== null
      )
    ) {
      report("submit", target);
    }
  }

  function emitNavigation(): void {
    const { href, pathname, search, hash } = deps.win.location;
    lastHref = href;
    emit({ kind: "navigate", selector: "", label: "", url: `${pathname}${search}${hash}` });
  }

  function checkNavigation(): void {
    if (deps.win.location.href !== lastHref) {
      emitNavigation();
    }
  }

  function stop(): void {
    cleanup?.();
    cleanup = null;
    deps.win.clearTimeout(activationTimer);
    clickedControl = null;
  }

  function start(
    startedAt: number,
    options: StepRecorderOptions = { announceNavigation: false },
  ): void {
    stop();
    origin = startedAt;
    const listeners: [string, (event: Event) => void][] = [
      ["click", onClick],
      ["change", onChange],
      ["submit", onSubmit],
    ];
    for (const [type, listener] of listeners) {
      deps.doc.addEventListener(type, listener, true);
    }
    lastHref = deps.win.location.href;
    const timer = deps.win.setInterval(checkNavigation, NAVIGATION_POLL_MS);
    cleanup = () => {
      for (const [type, listener] of listeners) {
        deps.doc.removeEventListener(type, listener, true);
      }
      deps.win.clearInterval(timer);
    };
    if (options.announceNavigation) {
      emitNavigation();
    }
  }

  return { start, stop, active: () => cleanup !== null };
}
