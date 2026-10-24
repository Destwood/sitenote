import type { ErrorCode } from "@sitenote/widget";

export const DEMO_RATE_LIMIT_MESSAGE = "demo_rate_limited";

interface ErrorFields {
  code?: unknown;
  message?: unknown;
}

const JWT_CODES: ReadonlySet<string> = new Set(["PGRST301", "PGRST302", "PGRST303"]);
const NETWORK_MESSAGE = /failed to fetch|network|fetch failed|timed? ?out|aborted/i;

function fieldsOf(error: unknown): ErrorFields {
  return typeof error === "object" && error !== null ? error : {};
}

function isNetworkFailure(error: unknown, fields: ErrorFields): boolean {
  if (error instanceof TypeError) {
    return true;
  }
  return typeof fields.message === "string" && NETWORK_MESSAGE.test(fields.message);
}

export function mapDemoError(error: unknown): ErrorCode {
  const fields = fieldsOf(error);
  const code = typeof fields.code === "string" ? fields.code : "";
  const message = typeof fields.message === "string" ? fields.message : "";

  if (code === "P0001" && message.includes(DEMO_RATE_LIMIT_MESSAGE)) {
    return "demo_limited";
  }
  if (JWT_CODES.has(code)) {
    return "unauthorized";
  }
  if (code === "42501") {
    return "forbidden";
  }
  if (code === "PGRST116") {
    return "not_found";
  }
  if (code.startsWith("22") || code.startsWith("23")) {
    return "validation";
  }
  if (isNetworkFailure(error, fields)) {
    return "network";
  }
  return "unknown";
}
