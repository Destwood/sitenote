import { type Fingerprint } from "../schema";
import { isStableClassName } from "../stable-class";
import { readCollapsedText } from "../text-model";

export const FINGERPRINT_TEXT_LIMIT = 120;

export const FINGERPRINT_WEIGHTS = { text: 0.55, classes: 0.2, size: 0.25 } as const;

export function createFingerprint(element: Element): Fingerprint {
  const rect = element.getBoundingClientRect();
  const classes = (element.getAttribute("class") ?? "")
    .split(/\s+/)
    .filter((name) => name !== "" && isStableClassName(name));
  return {
    tag: element.localName.toLowerCase(),
    text: readCollapsedText(element, FINGERPRINT_TEXT_LIMIT),
    classes: [...new Set(classes)].sort(),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function bigramCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let index = 0; index < text.length - 1; index += 1) {
    const bigram = text.slice(index, index + 2);
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }
  return counts;
}

export function textSimilarity(first: string, second: string): number {
  const a = first.toLowerCase();
  const b = second.toLowerCase();
  if (a === b) {
    return 1;
  }
  if (a.length < 2 || b.length < 2) {
    return 0;
  }
  const countsA = bigramCounts(a);
  const countsB = bigramCounts(b);
  let shared = 0;
  for (const [bigram, count] of countsA) {
    shared += Math.min(count, countsB.get(bigram) ?? 0);
  }
  return (2 * shared) / (a.length - 1 + (b.length - 1));
}

export function classSimilarity(first: readonly string[], second: readonly string[]): number {
  const a = new Set(first);
  const b = new Set(second);
  if (a.size === 0 && b.size === 0) {
    return 1;
  }
  let shared = 0;
  for (const name of a) {
    if (b.has(name)) {
      shared += 1;
    }
  }
  return shared / (a.size + b.size - shared);
}

function ratio(first: number, second: number): number {
  const largest = Math.max(first, second);
  return largest === 0 ? 1 : Math.min(first, second) / largest;
}

export function sizeSimilarity(first: Fingerprint, second: Fingerprint): number {
  return (ratio(first.width, second.width) + ratio(first.height, second.height)) / 2;
}

export function fingerprintSimilarity(first: Fingerprint, second: Fingerprint): number {
  if (first.tag !== second.tag) {
    return 0;
  }
  return Math.min(
    1,
    FINGERPRINT_WEIGHTS.text * textSimilarity(first.text, second.text) +
      FINGERPRINT_WEIGHTS.classes * classSimilarity(first.classes, second.classes) +
      FINGERPRINT_WEIGHTS.size * sizeSimilarity(first, second),
  );
}
