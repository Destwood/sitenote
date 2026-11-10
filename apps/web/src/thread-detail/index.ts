import { anchorSchema, parseThreadContext, type Anchor, type ThreadContext } from "@sitenote/core";
import type { Enums, SitenoteClient } from "@sitenote/db";
import type { ScreenshotState } from "@sitenote/ui";

import { toCommentViews, type CommentView } from "../thread-comments";
import { readRecordingState } from "../thread-recording";
import { readScreenshotState } from "../thread-screenshot";
import { FORMER_MEMBER_LABEL } from "../thread-table";
import { readWorkspaceMembers } from "../workspace-members";

export interface ThreadDetail {
  id: string;
  workspaceId: string;
  pageUrl: string;
  status: Enums<"thread_status">;
  createdAt: string;
  resolvedAt: string | null;
  authorName: string;
  excerpt: string;
  anchor: Anchor | null;
  context: ThreadContext | null;
  hasScreenshot: boolean;
  screenshot: ScreenshotState | undefined;
  recording: ScreenshotState | undefined;
  clickUpTaskUrl: string | null;
  jiraIssueKey: string | null;
  jiraIssueUrl: string | null;
  comments: CommentView[];
}

export async function readThreadDetail(
  supabase: SitenoteClient,
  threadId: string,
  workspaceId?: string,
): Promise<ThreadDetail | null> {
  const query = supabase
    .from("threads")
    .select(
      "id, workspace_id, page_url, status, created_at, created_by, resolved_at, screenshot_path, context, anchor, clickup_task_url, jira_issue_key, jira_issue_url",
    )
    .eq("id", threadId);
  const thread = await (
    workspaceId === undefined ? query : query.eq("workspace_id", workspaceId)
  ).maybeSingle();
  if (thread.error !== null) {
    throw new Error("Could not read the thread.");
  }
  if (thread.data === null) {
    return null;
  }
  const data = thread.data;

  const [commentRows, members] = await Promise.all([
    supabase
      .from("comments")
      .select("id, author_id, body, mentions, created_at, edited_at, deleted_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true }),
    readWorkspaceMembers(supabase, data.workspace_id),
  ]);
  if (commentRows.error !== null) {
    throw new Error("Could not read the comments.");
  }

  const context = parseThreadContext(data.context);
  const parsedAnchor = anchorSchema.safeParse(data.anchor);
  const comments = toCommentViews(commentRows.data, members);
  const recordingPath = context?.recording?.path;
  const [screenshot, recording] = await Promise.all([
    data.screenshot_path === null ? undefined : readScreenshotState(supabase, data.screenshot_path),
    recordingPath === undefined ? undefined : readRecordingState(supabase, recordingPath),
  ]);
  return {
    id: data.id,
    workspaceId: data.workspace_id,
    pageUrl: data.page_url,
    status: data.status,
    createdAt: data.created_at,
    resolvedAt: data.resolved_at,
    authorName:
      members.find((member) => member.userId === data.created_by)?.displayName ??
      FORMER_MEMBER_LABEL,
    excerpt: comments.find((comment) => !comment.deleted)?.body ?? "",
    anchor: parsedAnchor.success ? parsedAnchor.data : null,
    context,
    hasScreenshot: data.screenshot_path !== null,
    screenshot,
    recording,
    clickUpTaskUrl: data.clickup_task_url,
    jiraIssueKey: data.jira_issue_key,
    jiraIssueUrl: data.jira_issue_url,
    comments,
  };
}
