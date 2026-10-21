export type OAuthRedirect =
  { kind: "code"; code: string } | { kind: "denied" } | { kind: "error" } | { kind: "missing" };

const DENIED_ERRORS: ReadonlySet<string> = new Set(["access_denied", "user_cancelled"]);

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function readParam(url: URL, name: string): string | null {
  const value = url.searchParams.get(name) ?? new URLSearchParams(url.hash.slice(1)).get(name);
  return value === "" ? null : value;
}

export function parseOAuthRedirect(redirected: string, expectedRedirect: string): OAuthRedirect {
  const url = parseUrl(redirected);
  if (url === null || url.origin !== parseUrl(expectedRedirect)?.origin) {
    return { kind: "missing" };
  }
  const error = readParam(url, "error");
  if (error !== null) {
    return DENIED_ERRORS.has(error) ? { kind: "denied" } : { kind: "error" };
  }
  const code = readParam(url, "code");
  return code === null ? { kind: "missing" } : { kind: "code", code };
}
