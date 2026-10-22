export interface MentionCandidate {
  id: string;
  displayName: string;
}

export interface MentionQuery {
  query: string;
  start: number;
}

export interface InsertedMention {
  text: string;
  caret: number;
}

export type MentionSegment =
  { kind: "text"; text: string } | { kind: "mention"; text: string; userId: string };

const QUERY_MAX_LENGTH = 40;
const WORD_CHARACTER = /[\p{L}\p{N}\p{M}_]/u;
const WHITESPACE = /\s/u;

function isWordBefore(text: string, index: number): boolean {
  if (index === 0) {
    return false;
  }
  const previous = text.charCodeAt(index - 1);
  const isLowSurrogate = previous >= 0xdc00 && previous <= 0xdfff;
  const start = isLowSurrogate && index >= 2 ? index - 2 : index - 1;
  return WORD_CHARACTER.test(text.slice(start, index));
}

function isWordAt(text: string, index: number): boolean {
  const codePoint = text.codePointAt(index);
  return codePoint !== undefined && WORD_CHARACTER.test(String.fromCodePoint(codePoint));
}

export function findMentionQuery(text: string, caret: number): MentionQuery | null {
  if (!Number.isInteger(caret) || caret < 0 || caret > text.length) {
    return null;
  }
  const earliest = Math.max(0, caret - QUERY_MAX_LENGTH - 1);
  for (let index = caret - 1; index >= earliest; index -= 1) {
    const character = text.charAt(index);
    if (character === "\n" || character === "\r") {
      return null;
    }
    if (character === "@") {
      const before = text.charAt(index - 1);
      if (index > 0 && !WHITESPACE.test(before)) {
        return null;
      }
      return { query: text.slice(index + 1, caret), start: index };
    }
  }
  return null;
}

export function insertMention(
  text: string,
  start: number,
  caret: number,
  displayName: string,
): InsertedMention {
  const valid =
    Number.isInteger(start) &&
    Number.isInteger(caret) &&
    start >= 0 &&
    start <= caret &&
    caret <= text.length &&
    text.charAt(start) === "@";
  if (!valid) {
    return { text, caret };
  }
  const inserted = `@${displayName} `;
  return {
    text: text.slice(0, start) + inserted + text.slice(caret),
    caret: start + inserted.length,
  };
}

export function splitMentions(
  body: string,
  mentioned: readonly MentionCandidate[],
): MentionSegment[] {
  const idsByName = new Map<string, string[]>();
  for (const { id, displayName } of mentioned) {
    if (displayName !== "") {
      idsByName.set(displayName, [...(idsByName.get(displayName) ?? []), id]);
    }
  }
  const names = [...idsByName.keys()].sort((a, b) => b.length - a.length);
  const assigned = new Set<string>();
  const segments: MentionSegment[] = [];
  let textStart = 0;
  let index = body.indexOf("@");

  while (index !== -1) {
    const nameStart = index + 1;
    const name = isWordBefore(body, index)
      ? undefined
      : names.find(
          (candidate) =>
            body.startsWith(candidate, nameStart) && !isWordAt(body, nameStart + candidate.length),
        );
    const ids = name === undefined ? undefined : idsByName.get(name);
    const userId = ids?.find((id) => !assigned.has(id)) ?? ids?.[0];
    if (name === undefined || userId === undefined) {
      index = body.indexOf("@", nameStart);
      continue;
    }
    assigned.add(userId);
    if (index > textStart) {
      segments.push({ kind: "text", text: body.slice(textStart, index) });
    }
    const end = nameStart + name.length;
    segments.push({ kind: "mention", text: body.slice(index, end), userId });
    textStart = end;
    index = body.indexOf("@", end);
  }

  if (textStart < body.length) {
    segments.push({ kind: "text", text: body.slice(textStart) });
  }
  return segments;
}

export function mentionedIdsInBody(
  body: string,
  candidates: readonly MentionCandidate[],
): string[] {
  const ids = new Set<string>();
  for (const segment of splitMentions(body, candidates)) {
    if (segment.kind === "mention") {
      ids.add(segment.userId);
    }
  }
  return [...ids];
}
