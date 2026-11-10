export interface PageUrl {
  site: string;
  page: string;
}

export function parsePageUrl(input: string): PageUrl | null {
  const url = URL.parse(input);
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    return null;
  }
  return { site: url.origin, page: url.origin + url.pathname.replace(/\/+$/, "") };
}

export interface RouteSegment {
  text: string;
  full: string;
  dynamic: boolean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_PATTERN = /^[0-9a-f]+$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function isDynamicSegment(segment: string): boolean {
  const value = decodeSegment(segment);
  if (UUID_PATTERN.test(value)) {
    return true;
  }
  if (/^\d{3,}$/.test(value) || (value.length >= 8 && HEX_PATTERN.test(value))) {
    return true;
  }
  if (value.length >= 10 && /[A-Za-z]/.test(value) && /\d/.test(value)) {
    return true;
  }
  return value.length >= 20 && TOKEN_PATTERN.test(value);
}

function singularize(word: string): string {
  if (word.endsWith("ies")) {
    return `${word.slice(0, -3)}y`;
  }
  return word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}

function resourceName(segment: string): string {
  const words = segment.split(/[^A-Za-z0-9]+/).filter((word) => word !== "");
  const camel = words
    .map((word, index) =>
      index === 0
        ? word.toLowerCase()
        : `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`,
    )
    .join("");
  return singularize(camel);
}

export function abbreviateRoute(pathname: string): RouteSegment[] {
  const parts = pathname.split("/").filter((part) => part !== "");
  return parts.map((full, index) => {
    if (!isDynamicSegment(full)) {
      return { text: full, full, dynamic: false };
    }
    const previous = parts[index - 1];
    const name = previous === undefined || isDynamicSegment(previous) ? "" : resourceName(previous);
    return { text: name === "" ? "{id}" : `{${name}Id}`, full, dynamic: true };
  });
}
