import { isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";

import type { ErrorCode } from "../messages";

const RATE_LIMIT_STATUS = 429;
const UNAUTHORIZED_STATUS = 401;
const FORBIDDEN_STATUS = 403;
const NOT_FOUND_STATUS = 404;
const NETWORK_MESSAGE = /failed to fetch|network|fetch failed|timed? ?out|econn|enotfound|aborted/i;
const JWT_CODES: ReadonlySet<string> = new Set(["PGRST301", "PGRST302", "PGRST303"]);

interface ErrorFields {
  code?: unknown;
  status?: unknown;
  message?: unknown;
  name?: unknown;
}

function fieldsOf(error: unknown): ErrorFields {
  return typeof error === "object" && error !== null ? error : {};
}

function codeOf(fields: ErrorFields): string {
  return typeof fields.code === "string" ? fields.code : "";
}

function isNetworkFailure(error: unknown, fields: ErrorFields): boolean {
  if (isAuthError(error)) {
    return isAuthRetryableFetchError(error);
  }
  if (error instanceof TypeError) {
    return true;
  }
  return (
    codeOf(fields) === "" &&
    typeof fields.message === "string" &&
    NETWORK_MESSAGE.test(fields.message)
  );
}

export function mapDataError(error: unknown): ErrorCode {
  const fields = fieldsOf(error);
  const code = codeOf(fields);

  if (JWT_CODES.has(code) || fields.status === UNAUTHORIZED_STATUS) {
    return "unauthorized";
  }
  if (code === "42501" || fields.status === FORBIDDEN_STATUS) {
    return "forbidden";
  }
  if (code === "PGRST116" || fields.status === NOT_FOUND_STATUS) {
    return "not_found";
  }
  if (code.startsWith("22") || code.startsWith("23")) {
    return "validation";
  }
  if (fields.status === RATE_LIMIT_STATUS) {
    return "rate_limited";
  }
  if (isNetworkFailure(error, fields)) {
    return "network";
  }
  return "unknown";
}
