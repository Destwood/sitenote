const SITENOTE_HASH_KEY = "sitenote";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildThreadHash(threadId: string): string {
  return `#${SITENOTE_HASH_KEY}=${threadId}`;
}

export function appendThreadHash(pageUrl: string, threadId: string): string | null {
  const url = URL.parse(pageUrl);
  if (url === null) {
    return null;
  }
  url.hash = buildThreadHash(threadId);
  return url.href;
}

export function parseThreadHash(hash: string): string | null {
  const value = new URLSearchParams(hash.replace(/^#/, "")).get(SITENOTE_HASH_KEY);
  return value !== null && UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}
