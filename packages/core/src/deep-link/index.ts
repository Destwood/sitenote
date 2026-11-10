const SITENOTE_HASH_KEY = "sitenote";
const REPLAY_HASH_KEY = "replay";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReplayMode = "step" | "auto";

export const REPLAY_MODES: readonly ReplayMode[] = ["step", "auto"];

export function buildThreadHash(threadId: string, replay?: ReplayMode): string {
  const hash = `#${SITENOTE_HASH_KEY}=${threadId}`;
  return replay === undefined ? hash : `${hash}&${REPLAY_HASH_KEY}=${replay}`;
}

export function appendThreadHash(
  pageUrl: string,
  threadId: string,
  replay?: ReplayMode,
): string | null {
  const url = URL.parse(pageUrl);
  if (url === null) {
    return null;
  }
  url.hash = buildThreadHash(threadId, replay);
  return url.href;
}

export function parseThreadHash(hash: string): string | null {
  const value = new URLSearchParams(hash.replace(/^#/, "")).get(SITENOTE_HASH_KEY);
  return value !== null && UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

export function parseReplayMode(hash: string): ReplayMode | null {
  const value = new URLSearchParams(hash.replace(/^#/, "")).get(REPLAY_HASH_KEY);
  return REPLAY_MODES.find((mode) => mode === value) ?? null;
}
