import { type TextAnchor } from "../schema";
import { buildCssSelector } from "../selector";
import {
  buildTextModel,
  elementTextBounds,
  isElementNode,
  isInsideIgnoredElement,
  offsetsToRange,
  rangeToOffsets,
  type TextModel,
} from "../text-model";

export const CONTEXT_LENGTH = 32;
export const CONTAINER_MIN_CONTEXT_SCORE = 0.5;
export const TIE_CONFIDENCE_FACTOR = 0.5;

export type TextResolutionMethod = "container" | "document" | "position";

export type TextResolution =
  | { status: "resolved"; range: Range; method: TextResolutionMethod; confidence: number }
  | { status: "orphaned" };

interface Occurrence {
  index: number;
  score: number;
}

const ORPHANED: TextResolution = { status: "orphaned" };

function isBlock(element: Element, view: Window | null): boolean {
  if (!view) {
    return false;
  }
  const display = view.getComputedStyle(element).display;
  return !display.startsWith("inline") && display !== "contents";
}

function blockContainerOf(range: Range, body: HTMLElement, doc: Document): Element {
  const ancestor = range.commonAncestorContainer;
  let element = isElementNode(ancestor) ? ancestor : ancestor.parentElement;
  while (element && element !== body && body.contains(element)) {
    if (isBlock(element, doc.defaultView)) {
      return element;
    }
    element = element.parentElement;
  }
  return body;
}

export function createTextAnchor(range: Range, doc: Document = document): TextAnchor | null {
  const body = doc.body as HTMLElement | null;
  if (!body || range.collapsed) {
    return null;
  }
  const model = buildTextModel(body);
  const offsets = rangeToOffsets(range, model);
  if (!offsets) {
    return null;
  }
  let { start, end } = offsets;
  while (start < end && /\s/.test(model.text.charAt(start))) {
    start += 1;
  }
  while (end > start && /\s/.test(model.text.charAt(end - 1))) {
    end -= 1;
  }
  if (end <= start) {
    return null;
  }
  return {
    kind: "text",
    quote: {
      exact: model.text.slice(start, end),
      prefix: model.text.slice(Math.max(0, start - CONTEXT_LENGTH), start),
      suffix: model.text.slice(end, end + CONTEXT_LENGTH),
    },
    position: { start, end },
    container: buildCssSelector(blockContainerOf(range, body, doc), doc),
  };
}

function scoreOccurrence(text: string, index: number, anchor: TextAnchor): number {
  const { exact, prefix, suffix } = anchor.quote;
  const before = text.slice(Math.max(0, index - prefix.length), index);
  const after = text.slice(index + exact.length, index + exact.length + suffix.length);
  let matchedBefore = 0;
  while (
    matchedBefore < before.length &&
    before.charAt(before.length - 1 - matchedBefore) ===
      prefix.charAt(prefix.length - 1 - matchedBefore)
  ) {
    matchedBefore += 1;
  }
  let matchedAfter = 0;
  while (
    matchedAfter < after.length &&
    after.charAt(matchedAfter) === suffix.charAt(matchedAfter)
  ) {
    matchedAfter += 1;
  }
  const total = prefix.length + suffix.length;
  return total === 0 ? 1 : (matchedBefore + matchedAfter) / total;
}

function findOccurrences(text: string, anchor: TextAnchor, from: number, to: number): Occurrence[] {
  const { exact } = anchor.quote;
  const occurrences: Occurrence[] = [];
  for (
    let index = text.indexOf(exact, from);
    index !== -1;
    index = text.indexOf(exact, index + 1)
  ) {
    if (index + exact.length > to) {
      break;
    }
    occurrences.push({ index, score: scoreOccurrence(text, index, anchor) });
  }
  return occurrences;
}

function pickUnambiguous(occurrences: readonly Occurrence[]): Occurrence | undefined {
  const [best, second] = [...occurrences].sort((a, b) => b.score - a.score);
  return best && (!second || best.score > second.score) ? best : undefined;
}

function nearestBestOccurrence(
  occurrences: readonly Occurrence[],
  target: number,
): Occurrence | undefined {
  let best: Occurrence | undefined;
  for (const occurrence of occurrences) {
    if (
      !best ||
      occurrence.score > best.score ||
      (occurrence.score === best.score &&
        Math.abs(occurrence.index - target) < Math.abs(best.index - target))
    ) {
      best = occurrence;
    }
  }
  return best;
}

function confidenceOf(score: number): number {
  return 0.5 + 0.5 * score;
}

function resolved(
  model: TextModel,
  anchor: TextAnchor,
  index: number,
  method: TextResolutionMethod,
  confidence: number,
): TextResolution {
  const range = offsetsToRange(index, index + anchor.quote.exact.length, model);
  return range ? { status: "resolved", range, method, confidence } : ORPHANED;
}

function findContainer(selector: string, doc: Document): Element | undefined {
  try {
    const [element, ...others] = [...doc.querySelectorAll(selector)].filter(
      (candidate) => !isInsideIgnoredElement(candidate),
    );
    return others.length === 0 ? element : undefined;
  } catch {
    return undefined;
  }
}

export function resolveTextAnchor(anchor: TextAnchor, doc: Document = document): TextResolution {
  const body = doc.body as HTMLElement | null;
  if (!body) {
    return ORPHANED;
  }
  const model = buildTextModel(body);
  const { text } = model;

  const container = findContainer(anchor.container, doc);
  if (container) {
    const bounds = elementTextBounds(model, container);
    const picked = pickUnambiguous(findOccurrences(text, anchor, bounds.start, bounds.end));
    if (picked && picked.score >= CONTAINER_MIN_CONTEXT_SCORE) {
      return resolved(model, anchor, picked.index, "container", confidenceOf(picked.score));
    }
  }

  const occurrences = findOccurrences(text, anchor, 0, text.length);
  const picked = pickUnambiguous(occurrences);
  if (picked) {
    return resolved(model, anchor, picked.index, "document", confidenceOf(picked.score));
  }

  const { start, end } = anchor.position;
  if (end <= text.length && text.slice(start, end) === anchor.quote.exact) {
    return resolved(
      model,
      anchor,
      start,
      "position",
      confidenceOf(scoreOccurrence(text, start, anchor)),
    );
  }

  const nearest = nearestBestOccurrence(occurrences, start);
  if (nearest) {
    return resolved(
      model,
      anchor,
      nearest.index,
      "document",
      TIE_CONFIDENCE_FACTOR * confidenceOf(nearest.score),
    );
  }
  return ORPHANED;
}
