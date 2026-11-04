export interface TextSegment {
  kind: "text";
  text: string;
}

export interface LinkSegment {
  kind: "link";
  text: string;
  href: string;
}

export type LinkifiedSegment = TextSegment | LinkSegment;

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;
const TRAILING_PUNCTUATION = ".,;:!?]}";

function trimUrl(raw: string): string {
  let url = raw;
  for (;;) {
    const last = url.at(-1);
    if (last === undefined) {
      return url;
    }
    if (TRAILING_PUNCTUATION.includes(last) || (last === ")" && !url.includes("("))) {
      url = url.slice(0, -1);
    } else {
      return url;
    }
  }
}

function isWebUrl(candidate: string): boolean {
  if (!URL.canParse(candidate)) {
    return false;
  }
  const { protocol } = new URL(candidate);
  return protocol === "http:" || protocol === "https:";
}

export function splitLinks(text: string): LinkifiedSegment[] {
  const segments: LinkifiedSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index;
    const href = trimUrl(match[0]);
    if (!isWebUrl(href)) {
      continue;
    }
    if (start > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, start) });
    }
    segments.push({ kind: "link", text: href, href });
    cursor = start + href.length;
  }
  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }
  return segments;
}
