export const DEFAULT_REDIRECT_PATH = "/app";

const PLACEHOLDER_ORIGIN = "http://sitenote.invalid";
const MAX_LENGTH = 2048;
const MAX_DECODE_ROUNDS = 3;
const BACKSLASH = 0x5c;
const LAST_C0_CONTROL = 0x1f;
const FIRST_C1_CONTROL = 0x7f;
const LAST_C1_CONTROL = 0x9f;
const LINE_SEPARATOR = 0x2028;
const PARAGRAPH_SEPARATOR = 0x2029;

type RedirectInput = string | readonly string[] | null | undefined;

function hasForbiddenCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (
      code === BACKSLASH ||
      code <= LAST_C0_CONTROL ||
      (code >= FIRST_C1_CONTROL && code <= LAST_C1_CONTROL) ||
      code === LINE_SEPARATOR ||
      code === PARAGRAPH_SEPARATOR
    ) {
      return true;
    }
  }
  return false;
}

function isRelativePath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !hasForbiddenCharacter(value);
}

function staysRelativeWhenDecoded(value: string): boolean {
  let current = value;
  for (let round = 0; round < MAX_DECODE_ROUNDS; round += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return true;
    }
    if (decoded === current) {
      return true;
    }
    if (!isRelativePath(decoded)) {
      return false;
    }
    current = decoded;
  }
  return true;
}

export function safeRedirectPath(
  input: RedirectInput,
  fallback: string = DEFAULT_REDIRECT_PATH,
): string {
  if (typeof input !== "string" || input.length > MAX_LENGTH) {
    return fallback;
  }
  if (!isRelativePath(input) || !staysRelativeWhenDecoded(input)) {
    return fallback;
  }
  let resolved: URL;
  try {
    resolved = new URL(input, PLACEHOLDER_ORIGIN);
  } catch {
    return fallback;
  }
  if (resolved.origin !== PLACEHOLDER_ORIGIN) {
    return fallback;
  }
  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  return isRelativePath(path) ? path : fallback;
}
