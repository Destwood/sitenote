import { anchorSchema, parsePageUrl } from "@sitenote/core";
import * as z from "zod/mini";

import {
  THREAD_STATUSES,
  commentRecordSchema,
  memberRecordSchema,
  notificationListSchema,
  threadRecordSchema,
  workspaceInfoSchema,
  siteInfoSchema,
  type CommentRecord,
  type MemberRecord,
  type NotificationList,
  type SiteInfo,
  type ThreadRecord,
  type WorkspaceInfo,
} from "../transport";

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
  "network",
  "unknown",
  "page_unavailable",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

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
  network: "Sitenote could not reach the server. Check your connection and try again.",
  unknown: "Something went wrong. Try again.",
  page_unavailable: "Sitenote is not available on this page.",
};

export const OTP_LENGTH = 6;
export const COMMENT_MAX_LENGTH = 10000;
export const MENTIONS_MAX = 20;
export const NOTIFICATIONS_PAGE_MAX = 100;
export const PAGE_PORT_NAME = "sitenote:page";
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

function isBareOrigin(value: string): boolean {
  const url = URL.parse(value);
  return (
    url !== null && (url.protocol === "http:" || url.protocol === "https:") && url.origin === value
  );
}

const idSchema = z.guid();
const originSchema = z.string().check(z.refine(isBareOrigin));
const pageUrlSchema = z.string().check(z.refine((value) => parsePageUrl(value)?.page === value));
const bodySchema = z.string().check(z.trim(), z.minLength(1), z.maxLength(COMMENT_MAX_LENGTH));
const mentionsSchema = z.array(idSchema).check(z.maxLength(MENTIONS_MAX));
const tabIdSchema = z.int().check(z.nonnegative());
const notificationLimitSchema = z.int().check(z.minimum(1), z.maximum(NOTIFICATIONS_PAGE_MAX));
const notificationIdsSchema = z
  .array(idSchema)
  .check(z.minLength(1), z.maxLength(NOTIFICATIONS_PAGE_MAX));

export const dataRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sites.forOrigin"), origin: originSchema }),
  z.object({ type: z.literal("threads.list"), siteId: idSchema, pageUrl: pageUrlSchema }),
  z.object({
    type: z.literal("threads.create"),
    siteId: idSchema,
    pageUrl: pageUrlSchema,
    anchor: anchorSchema,
    context: z.record(z.string(), z.json()),
    body: bodySchema,
    mentions: mentionsSchema,
  }),
  z.object({
    type: z.literal("threads.setStatus"),
    threadId: idSchema,
    status: z.enum(THREAD_STATUSES),
  }),
  z.object({
    type: z.literal("comments.create"),
    threadId: idSchema,
    body: bodySchema,
    mentions: mentionsSchema,
  }),
  z.object({ type: z.literal("comments.update"), commentId: idSchema, body: bodySchema }),
  z.object({ type: z.literal("comments.delete"), commentId: idSchema }),
  z.object({ type: z.literal("workspaces.list") }),
  z.object({ type: z.literal("members.list"), workspaceId: idSchema }),
  z.object({ type: z.literal("notifications.list"), limit: notificationLimitSchema }),
  z.object({ type: z.literal("notifications.markRead"), ids: notificationIdsSchema }),
  z.object({ type: z.literal("notifications.markAllRead") }),
  z.object({
    type: z.literal("sites.enable"),
    tabId: tabIdSchema,
    origin: originSchema,
    workspaceId: idSchema,
  }),
  z.object({ type: z.literal("sites.disable"), origin: originSchema }),
]);

export type DataRequest = z.infer<typeof dataRequestSchema>;
export type DataRequestType = DataRequest["type"];

export const requestSchema = z.union([authRequestSchema, dataRequestSchema]);

export type ExtensionRequest = AuthRequest | DataRequest;
export type ExtensionRequestType = ExtensionRequest["type"];

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

export const notificationsChangedSchema = z.object({
  type: z.literal("notifications.changed"),
  unread: z.int().check(z.nonnegative()),
});

export type NotificationsChangedMessage = z.infer<typeof notificationsChangedSchema>;

const errorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.enum(ERROR_CODES), message: z.string() }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

export interface SuccessResponse<Data> {
  ok: true;
  data: Data;
}

export type MessageResult<Data> = SuccessResponse<Data> | ErrorResponse;

export interface AuthDataByType {
  "auth.getState": AuthState;
  "auth.sendCode": null;
  "auth.verifyCode": AuthState;
  "auth.signInWithGoogle": AuthState;
  "auth.signOut": AuthState;
}

export interface DataByType {
  "sites.forOrigin": SiteInfo | null;
  "threads.list": ThreadRecord[];
  "threads.create": ThreadRecord;
  "threads.setStatus": ThreadRecord;
  "comments.create": CommentRecord;
  "comments.update": CommentRecord;
  "comments.delete": CommentRecord;
  "workspaces.list": WorkspaceInfo[];
  "members.list": MemberRecord[];
  "notifications.list": NotificationList;
  "notifications.markRead": null;
  "notifications.markAllRead": null;
  "sites.enable": null;
  "sites.disable": null;
}

export type DataByRequestType = AuthDataByType & DataByType;

export function resultSchema<Data>(data: z.ZodMiniType<Data>): z.ZodMiniType<MessageResult<Data>> {
  return z.union([z.object({ ok: z.literal(true), data }), errorResponseSchema]);
}

export const RESPONSE_SCHEMAS: {
  [Type in ExtensionRequestType]: z.ZodMiniType<MessageResult<DataByRequestType[Type]>>;
} = {
  "auth.getState": resultSchema(authStateSchema),
  "auth.sendCode": resultSchema(z.null()),
  "auth.verifyCode": resultSchema(authStateSchema),
  "auth.signInWithGoogle": resultSchema(authStateSchema),
  "auth.signOut": resultSchema(authStateSchema),
  "sites.forOrigin": resultSchema(z.nullable(siteInfoSchema)),
  "threads.list": resultSchema(z.array(threadRecordSchema)),
  "threads.create": resultSchema(threadRecordSchema),
  "threads.setStatus": resultSchema(threadRecordSchema),
  "comments.create": resultSchema(commentRecordSchema),
  "comments.update": resultSchema(commentRecordSchema),
  "comments.delete": resultSchema(commentRecordSchema),
  "workspaces.list": resultSchema(z.array(workspaceInfoSchema)),
  "members.list": resultSchema(z.array(memberRecordSchema)),
  "notifications.list": resultSchema(notificationListSchema),
  "notifications.markRead": resultSchema(z.null()),
  "notifications.markAllRead": resultSchema(z.null()),
  "sites.enable": resultSchema(z.null()),
  "sites.disable": resultSchema(z.null()),
};

export const pageSubscribeSchema = z.object({
  type: z.literal("page.subscribe"),
  siteId: idSchema,
  workspaceId: idSchema,
  pageUrl: pageUrlSchema,
});

export const pageUpdateSchema = z.object({
  type: z.literal("page.update"),
  pageUrl: pageUrlSchema,
});

export const pageClientMessageSchema = z.discriminatedUnion("type", [
  pageSubscribeSchema,
  pageUpdateSchema,
]);

export type PageSubscribeMessage = z.infer<typeof pageSubscribeSchema>;
export type PageClientMessage = z.infer<typeof pageClientMessageSchema>;

export const pageEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("page.subscribed") }),
  z.object({ type: z.literal("threads.changed"), threadId: idSchema }),
  z.object({ type: z.literal("comments.changed"), threadId: idSchema }),
  z.object({ type: z.literal("site.disabled") }),
]);

export type PageEvent = z.infer<typeof pageEventSchema>;

export const commentModeToggleSchema = z.object({ type: z.literal("commentMode.toggle") });

export const commentModeStateSchema = z.object({ active: z.boolean() });

export type CommentModeState = z.infer<typeof commentModeStateSchema>;

export const commentModeResponseSchema = resultSchema(commentModeStateSchema);

export function success<Data>(data: Data): SuccessResponse<Data> {
  return { ok: true, data };
}

export function failure(code: ErrorCode): ErrorResponse {
  return { ok: false, error: { code, message: ERROR_MESSAGES[code] } };
}
