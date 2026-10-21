import * as z from "zod/mini";

export const AUTH_ERROR_CODES = [
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
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export const AUTH_ERROR_MESSAGES: Readonly<Record<AuthErrorCode, string>> = {
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
};

export const OTP_LENGTH = 6;
const MAX_EMAIL_LENGTH = 254;

const emailSchema = z.string().check(z.trim(), z.maxLength(MAX_EMAIL_LENGTH), z.email());
const codeSchema = z.string().check(z.regex(new RegExp(`^[0-9]{${String(OTP_LENGTH)}}$`)));

export const authRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("auth.getState") }),
  z.object({ type: z.literal("auth.sendCode"), email: emailSchema }),
  z.object({ type: z.literal("auth.verifyCode"), email: emailSchema, code: codeSchema }),
  z.object({ type: z.literal("auth.signInWithGoogle") }),
  z.object({ type: z.literal("auth.signOut") }),
]);

export type AuthRequest = z.infer<typeof authRequestSchema>;
export type AuthRequestType = AuthRequest["type"];

export const authStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("signedOut") }),
  z.object({
    status: z.literal("signedIn"),
    user: z.object({
      id: z.string(),
      email: z.nullable(z.string()),
      displayName: z.string(),
      isAnonymous: z.boolean(),
    }),
  }),
]);

export type AuthState = z.infer<typeof authStateSchema>;

export const authStateChangedSchema = z.object({
  type: z.literal("auth.stateChanged"),
  state: authStateSchema,
});

export type AuthStateChangedMessage = z.infer<typeof authStateChangedSchema>;

const authErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.enum(AUTH_ERROR_CODES), message: z.string() }),
});

export type AuthErrorResponse = z.infer<typeof authErrorSchema>;

export interface AuthSuccessResponse<Data> {
  ok: true;
  data: Data;
}

export type AuthResult<Data> = AuthSuccessResponse<Data> | AuthErrorResponse;

export interface AuthDataByType {
  "auth.getState": AuthState;
  "auth.sendCode": null;
  "auth.verifyCode": AuthState;
  "auth.signInWithGoogle": AuthState;
  "auth.signOut": AuthState;
}

function resultSchema<Data>(data: z.ZodMiniType<Data>): z.ZodMiniType<AuthResult<Data>> {
  return z.union([z.object({ ok: z.literal(true), data }), authErrorSchema]);
}

export const AUTH_RESPONSE_SCHEMAS: {
  [Type in AuthRequestType]: z.ZodMiniType<AuthResult<AuthDataByType[Type]>>;
} = {
  "auth.getState": resultSchema(authStateSchema),
  "auth.sendCode": resultSchema(z.null()),
  "auth.verifyCode": resultSchema(authStateSchema),
  "auth.signInWithGoogle": resultSchema(authStateSchema),
  "auth.signOut": resultSchema(authStateSchema),
};

export function success<Data>(data: Data): AuthSuccessResponse<Data> {
  return { ok: true, data };
}

export function failure(code: AuthErrorCode): AuthErrorResponse {
  return { ok: false, error: { code, message: AUTH_ERROR_MESSAGES[code] } };
}
