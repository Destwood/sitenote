import { anchorSchema } from "@sitenote/core";
import * as z from "zod/mini";

export const MEMBER_ROLES = ["owner", "member", "guest"] as const;
export const THREAD_STATUSES = ["open", "resolved"] as const;

const idSchema = z.guid();

export const siteInfoSchema = z.object({
  siteId: idSchema,
  workspaceId: idSchema,
  workspaceName: z.string(),
  role: z.enum(MEMBER_ROLES),
  userId: idSchema,
});

export type SiteInfo = z.infer<typeof siteInfoSchema>;

export const workspaceInfoSchema = z.object({
  id: idSchema,
  name: z.string(),
  role: z.enum(MEMBER_ROLES),
});

export type WorkspaceInfo = z.infer<typeof workspaceInfoSchema>;

export const personRecordSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  avatarUrl: z.nullable(z.string()),
});

export type PersonRecord = z.infer<typeof personRecordSchema>;

export const commentRecordSchema = z.object({
  id: idSchema,
  threadId: idSchema,
  author: personRecordSchema,
  body: z.string(),
  createdAt: z.iso.datetime(),
  editedAt: z.nullable(z.iso.datetime()),
  deleted: z.boolean(),
});

export type CommentRecord = z.infer<typeof commentRecordSchema>;

export const threadRecordSchema = z.object({
  id: idSchema,
  siteId: idSchema,
  pageUrl: z.string(),
  status: z.enum(THREAD_STATUSES),
  anchor: z.nullable(anchorSchema),
  author: personRecordSchema,
  createdAt: z.iso.datetime(),
  comments: z.array(commentRecordSchema),
});

export type ThreadRecord = z.infer<typeof threadRecordSchema>;
