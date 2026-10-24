export const ERROR_CODES = [
  "invalid_request",
  "forbidden_sender",
  "unavailable",
  "state_failed",
  "invalid_email",
  "rate_limited",
  "send_failed",
  "invalid_code",
  "verify_failed",
  "google_disabled",
  "google_cancelled",
  "google_failed",
  "sign_out_failed",
  "already_signed_in",
  "session_rejected",
  "unauthorized",
  "forbidden",
  "not_found",
  "validation",
  "not_configured",
  "upstream",
  "network",
  "unknown",
  "page_unavailable",
  "capture_failed",
  "demo_limited",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: string): value is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value);
}

export const ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = {
  invalid_request: "The request was not understood.",
  forbidden_sender: "This request is not allowed.",
  unavailable: "Sitenote could not be reached. Reload the extension and try again.",
  state_failed: "We could not check your session. Check your connection and try again.",
  invalid_email: "Enter a valid email address.",
  rate_limited: "Too many attempts. Wait a minute and try again.",
  send_failed: "We could not send the code. Check your connection and try again.",
  invalid_code: "That code is wrong or has expired. Check the code or request a new one.",
  verify_failed: "We could not verify the code. Check your connection and try again.",
  google_disabled: "Google sign-in is not available.",
  google_cancelled: "Sign-in was cancelled. You can try again.",
  google_failed: "We could not complete Google sign-in. Try again or use an email code.",
  sign_out_failed: "We could not sign you out. Try again.",
  already_signed_in: "The extension is already signed in to an account.",
  session_rejected: "The extension could not accept this guest session.",
  unauthorized: "Sign in to Sitenote to continue.",
  forbidden: "You do not have permission to do this.",
  not_found: "That item no longer exists.",
  validation: "That input was not accepted. Check it and try again.",
  not_configured: "ClickUp is not connected to this workspace yet.",
  upstream: "ClickUp did not answer. Try again.",
  network: "Sitenote could not reach the server. Check your connection and try again.",
  unknown: "Something went wrong. Try again.",
  page_unavailable: "Sitenote is not available on this page.",
  capture_failed: "The screenshot could not be taken.",
  demo_limited: "Demo limit reached — try again later.",
};

export interface SuccessResponse<Data> {
  ok: true;
  data: Data;
}

export interface ErrorResponse {
  ok: false;
  error: { code: ErrorCode; message: string };
}

export type MessageResult<Data> = SuccessResponse<Data> | ErrorResponse;

export function success<Data>(data: Data): SuccessResponse<Data> {
  return { ok: true, data };
}

export function failure(code: ErrorCode): ErrorResponse {
  return { ok: false, error: { code, message: ERROR_MESSAGES[code] } };
}
