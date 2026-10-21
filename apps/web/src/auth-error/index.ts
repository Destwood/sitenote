const CALLBACK_ERROR_KEYS = ["missing_code", "exchange_failed", "access_denied"] as const;

export type CallbackErrorKey = (typeof CALLBACK_ERROR_KEYS)[number];

const CALLBACK_ERROR_MESSAGES: Readonly<Record<CallbackErrorKey, string>> = {
  missing_code: "The sign-in link is incomplete. Start again.",
  exchange_failed: "We could not complete the sign-in. Start again.",
  access_denied: "Sign-in was cancelled. You can try again.",
};

const OTP_EXPIRED = "otp_expired";
const INVALID_EMAIL = "email_address_invalid";
const RATE_LIMIT_CODES: ReadonlySet<string> = new Set([
  "over_email_send_rate_limit",
  "over_request_rate_limit",
]);
const RATE_LIMIT_STATUS = 429;
const RATE_LIMIT_MESSAGE = "Too many attempts. Wait a minute and try again.";

export interface AuthFailure {
  code?: string | undefined;
  status?: number | undefined;
}

function isRateLimited(failure: AuthFailure): boolean {
  return (
    failure.status === RATE_LIMIT_STATUS ||
    (failure.code !== undefined && RATE_LIMIT_CODES.has(failure.code))
  );
}

export function parseCallbackError(
  value: string | readonly string[] | null | undefined,
): CallbackErrorKey | null {
  return CALLBACK_ERROR_KEYS.find((key) => key === value) ?? null;
}

export function describeCallbackError(key: CallbackErrorKey): string {
  return CALLBACK_ERROR_MESSAGES[key];
}

export function describeSendCodeError(failure: AuthFailure): string {
  if (isRateLimited(failure)) {
    return RATE_LIMIT_MESSAGE;
  }
  if (failure.code === INVALID_EMAIL) {
    return "Enter a valid email address.";
  }
  return "We could not send the code. Check your connection and try again.";
}

export function describeVerifyCodeError(failure: AuthFailure): string {
  if (isRateLimited(failure)) {
    return RATE_LIMIT_MESSAGE;
  }
  if (failure.code === OTP_EXPIRED) {
    return "That code is wrong or has expired. Check the code or request a new one.";
  }
  return "We could not verify the code. Check your connection and try again.";
}

export function describeOAuthError(failure: AuthFailure): string {
  if (isRateLimited(failure)) {
    return RATE_LIMIT_MESSAGE;
  }
  return "We could not start Google sign-in. Try again or use an email code.";
}
