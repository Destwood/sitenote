import { createFingerprint, fingerprintSimilarity, textSimilarity } from "../fingerprint";
import { type ElementAnchor, type Fingerprint } from "../schema";
import { buildCssSelector, buildNthPath, isStableId } from "../selector";
import { isInsideIgnoredElement } from "../text-model";

export const ACCEPT_THRESHOLD = 0.5;
export const NTH_PATH_THRESHOLD = 0.7;
export const FINGERPRINT_THRESHOLD = 0.75;
export const FINGERPRINT_MARGIN = 0.05;
export const MIN_TEXT_SIMILARITY = 0.5;
export const MAX_FINGERPRINT_CANDIDATES = 5000;

export type ElementResolutionMethod = "id" | "testId" | "css" | "nthPath" | "fingerprint";

export type ElementResolution =
  | { status: "resolved"; element: Element; method: ElementResolutionMethod; confidence: number }
  | { status: "orphaned" };

interface SelectorAttempt {
  method: Exclude<ElementResolutionMethod, "fingerprint">;
  selector: string | undefined;
  threshold: number;
  requiresTextMatch: boolean;
}

const ORPHANED: ElementResolution = { status: "orphaned" };

function fraction(value: number, origin: number, size: number): number {
  if (size <= 0) {
    return 0.5;
  }
  const result = (value - origin) / size;
  return Math.round(Math.min(1, Math.max(0, result)) * 10000) / 10000;
}

export function createElementAnchor(
  element: Element,
  point: { clientX: number; clientY: number },
): ElementAnchor {
  const rect = element.getBoundingClientRect();
  const selectors: ElementAnchor["selectors"] = {
    css: buildCssSelector(element),
    nthPath: buildNthPath(element),
  };
  const id = element.getAttribute("id");
  if (id !== null && isStableId(id)) {
    selectors.id = id;
  }
  const testId = element.getAttribute("data-testid");
  if (testId !== null && testId !== "") {
    selectors.testId = testId;
  }
  return {
    kind: "element",
    selectors,
    fingerprint: createFingerprint(element),
    offset: {
      x: fraction(point.clientX, rect.left, rect.width),
      y: fraction(point.clientY, rect.top, rect.height),
    },
  };
}

export function pinPosition(
  element: Element,
  offset: { x: number; y: number },
): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width * offset.x, y: rect.top + rect.height * offset.y };
}

function queryAll(doc: Document, selector: string): Element[] {
  try {
    return [...doc.querySelectorAll(selector)].filter(
      (element) => !isInsideIgnoredElement(element),
    );
  } catch {
    return [];
  }
}

function selectorAttempts(anchor: ElementAnchor): SelectorAttempt[] {
  const { id, testId, css, nthPath } = anchor.selectors;
  return [
    {
      method: "id",
      selector: id === undefined ? undefined : `#${CSS.escape(id)}`,
      threshold: ACCEPT_THRESHOLD,
      requiresTextMatch: false,
    },
    {
      method: "testId",
      selector: testId === undefined ? undefined : `[data-testid="${CSS.escape(testId)}"]`,
      threshold: ACCEPT_THRESHOLD,
      requiresTextMatch: false,
    },
    { method: "css", selector: css, threshold: ACCEPT_THRESHOLD, requiresTextMatch: true },
    {
      method: "nthPath",
      selector: nthPath,
      threshold: NTH_PATH_THRESHOLD,
      requiresTextMatch: true,
    },
  ];
}

function hasConflictingText(expected: Fingerprint, current: Fingerprint): boolean {
  return (
    expected.text !== "" &&
    current.text !== "" &&
    textSimilarity(expected.text, current.text) < MIN_TEXT_SIMILARITY
  );
}

function resolveBySelectors(anchor: ElementAnchor, doc: Document): ElementResolution {
  for (const attempt of selectorAttempts(anchor)) {
    if (attempt.selector === undefined) {
      continue;
    }
    const [element, ...others] = queryAll(doc, attempt.selector);
    if (!element || others.length > 0) {
      continue;
    }
    const current = createFingerprint(element);
    const confidence = fingerprintSimilarity(anchor.fingerprint, current);
    if (
      confidence >= attempt.threshold &&
      !(attempt.requiresTextMatch && hasConflictingText(anchor.fingerprint, current))
    ) {
      return { status: "resolved", element, method: attempt.method, confidence };
    }
  }
  return ORPHANED;
}

function resolveByFingerprint(anchor: ElementAnchor, doc: Document): ElementResolution {
  const body = doc.body as HTMLElement | null;
  if (!body) {
    return ORPHANED;
  }
  let best: { element: Element; score: number } | undefined;
  let runnerUp = 0;
  let inspected = 0;
  for (const element of body.getElementsByTagName("*")) {
    if (inspected >= MAX_FINGERPRINT_CANDIDATES) {
      break;
    }
    if (
      element.localName.toLowerCase() !== anchor.fingerprint.tag ||
      isInsideIgnoredElement(element)
    ) {
      continue;
    }
    inspected += 1;
    const score = fingerprintSimilarity(anchor.fingerprint, createFingerprint(element));
    if (!best || score > best.score) {
      runnerUp = best?.score ?? 0;
      best = { element, score };
    } else if (score > runnerUp) {
      runnerUp = score;
    }
  }
  if (best && best.score >= FINGERPRINT_THRESHOLD && best.score - runnerUp >= FINGERPRINT_MARGIN) {
    return {
      status: "resolved",
      element: best.element,
      method: "fingerprint",
      confidence: best.score,
    };
  }
  return ORPHANED;
}

export function resolveElementAnchor(
  anchor: ElementAnchor,
  doc: Document = document,
): ElementResolution {
  const bySelectors = resolveBySelectors(anchor, doc);
  return bySelectors.status === "resolved" ? bySelectors : resolveByFingerprint(anchor, doc);
}
