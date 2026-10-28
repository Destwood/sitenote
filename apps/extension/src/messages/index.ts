import { anchorSchema, parsePageUrl, threadContextSchema } from "@sitenote/core";
import {
  ERROR_CODES,
  THREAD_STATUSES,
  clickUpTaskResultSchema,
  httpUrlSchema,
  captureRectSchema,
  capturedScreenshotSchema,
  commentRecordSchema,
  memberRecordSchema,
  notificationListSchema,
  preferencesSchema,
  threadRecordSchema,
  workspaceInfoSchema,
  siteInfoSchema,
  type CapturedScreenshot,
  type ClickUpTaskResult,
  type CommentRecord,
  type MemberRecord,
  type MessageResult,
  type NotificationList,
  type Preferences,
  type SiteInfo,
  type ThreadRecord,
  type WorkspaceInfo,
} from "@sitenote/widget";
import * as z from "zod/mini";

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
const selectionPlacementSchema = z.enum(["below", "above"]);
export type SelectionPlacement = z.infer<typeof selectionPlacementSchema>;
const originSchema = z.string().check(z.refine(isBareOrigin));
const pageUrlSchema = z.string().check(z.refine((value) => parsePageUrl(value)?.page === value));
const bodySchema = z.string().check(z.trim(), z.minLength(1), z.maxLength(COMMENT_MAX_LENGTH));
const mentionsSchema = z.array(idSchema).check(z.maxLength(MENTIONS_MAX));
const tabIdSchema = z.int().check(z.nonnegative());
const devicePixelRatioSchema = z.number().check(z.gt(0), z.lte(16));
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
    context: threadContextSchema,
    captureId: z.optional(idSchema),
    body: bodySchema,
    mentions: mentionsSchema,
  }),
  z.object({ type: z.literal("threads.screenshotUrl"), threadId: idSchema }),
  z.object({
    type: z.literal("screenshot.capture"),
    rect: captureRectSchema,
    devicePixelRatio: devicePixelRatioSchema,
  }),
  z.object({ type: z.literal("preferences.get"), siteId: idSchema }),
  z.object({
    type: z.literal("preferences.set"),
    siteId: idSchema,
    showResolved: z.boolean(),
  }),
  z.object({ type: z.literal("preferences.getSelectionPlacement") }),
  z.object({
    type: z.literal("preferences.setSelectionPlacement"),
    placement: selectionPlacementSchema,
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
  z.object({ type: z.literal("clickup.status"), workspaceId: idSchema }),
  z.object({ type: z.literal("clickup.createTask"), threadId: idSchema }),
  z.object({
    type: z.literal("sites.setErrorCapture"),
    tabId: tabIdSchema,
    origin: originSchema,
    enabled: z.boolean(),
  }),
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
  "threads.screenshotUrl": string | null;
  "screenshot.capture": CapturedScreenshot;
  "preferences.get": Preferences;
  "preferences.set": null;
  "preferences.getSelectionPlacement": SelectionPlacement;
  "preferences.setSelectionPlacement": null;
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
  "sites.setErrorCapture": null;
  "clickup.status": boolean;
  "clickup.createTask": ClickUpTaskResult;
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
  "threads.screenshotUrl": resultSchema(z.nullable(httpUrlSchema)),
  "screenshot.capture": resultSchema(capturedScreenshotSchema),
  "preferences.get": resultSchema(preferencesSchema),
  "preferences.set": resultSchema(z.null()),
  "preferences.getSelectionPlacement": resultSchema(selectionPlacementSchema),
  "preferences.setSelectionPlacement": resultSchema(z.null()),
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
  "sites.setErrorCapture": resultSchema(z.null()),
  "clickup.status": resultSchema(z.boolean()),
  "clickup.createTask": resultSchema(clickUpTaskResultSchema),
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

export const commentOnElementSchema = z.object({ type: z.literal("commentMode.commentOnElement") });

export const commentOnElementStateSchema = z.object({ started: z.boolean() });

export type CommentOnElementState = z.infer<typeof commentOnElementStateSchema>;

export const commentOnElementResponseSchema = resultSchema(commentOnElementStateSchema);

export const pageThreadsRequestSchema = z.object({ type: z.literal("page.listThreads") });

export const pageThreadSummarySchema = z.object({
  id: idSchema,
  number: z.int().check(z.positive()),
  status: z.enum(THREAD_STATUSES),
  excerpt: z.string(),
  authorName: z.string(),
  replies: z.int().check(z.nonnegative()),
  detached: z.boolean(),
});

export const pageThreadsResponseSchema = resultSchema(z.array(pageThreadSummarySchema));

export const pageOpenThreadSchema = z.object({
  type: z.literal("page.openThread"),
  threadId: idSchema,
});

export const pageOpenThreadStateSchema = z.object({ opened: z.boolean() });

export type PageOpenThreadState = z.infer<typeof pageOpenThreadStateSchema>;

export const pageOpenThreadResponseSchema = resultSchema(pageOpenThreadStateSchema);

export const pageOpenSidebarSchema = z.object({ type: z.literal("page.openSidebar") });

export const pageOpenSidebarStateSchema = z.object({ opened: z.boolean() });

export type PageOpenSidebarState = z.infer<typeof pageOpenSidebarStateSchema>;

export const pageOpenSidebarResponseSchema = resultSchema(pageOpenSidebarStateSchema);
