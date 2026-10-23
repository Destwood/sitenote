import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { parseThreadContext } from "@sitenote/core";

import { CopyLink } from "../../../../../../copy-link";
import { getPublicEnv } from "../../../../../../env";
import { LINK_BUTTON_CLASS } from "../../../../../../form-controls";
import { formatUtcDateTime } from "../../../../../../format-utc";
import { PageContext } from "../../../../../../page-context";
import { pagePathLabel } from "../../../../../../page-path";
import { safeExternalHref } from "../../../../../../safe-external-link";
import {
  createSupabaseServerClient,
  getAuthenticatedUser,
} from "../../../../../../supabase-server";
import { ThreadComments, toCommentViews } from "../../../../../../thread-comments";
import { readScreenshotState } from "../../../../../../thread-screenshot";
import { ThreadStatusForm } from "../../../../../../thread-status-form";
import { THREAD_STATUS_LABELS } from "../../../../../../thread-status";
import { FORMER_MEMBER_LABEL } from "../../../../../../thread-table";
import { parseUuid } from "../../../../../../uuid";
import { readWorkspaceMembers } from "../../../../../../workspace-members";
import { threadPath, workspacePath } from "../../../../../../workspace-paths";

export const metadata: Metadata = {
  title: "Thread | Sitenote",
  referrer: "no-referrer",
};

interface ThreadPageProps {
  params: Promise<{ workspaceId: string; threadId: string }>;
}

export default async function ThreadPage({ params }: ThreadPageProps) {
  const { workspaceId: rawWorkspaceId, threadId: rawThreadId } = await params;
  const workspaceId = parseUuid(rawWorkspaceId);
  const threadId = parseUuid(rawThreadId);
  if (workspaceId === null || threadId === null) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (user === null) {
    redirect(`/sign-in?next=${encodeURIComponent(threadPath(workspaceId, threadId))}`);
  }

  const [thread, commentRows, members] = await Promise.all([
    supabase
      .from("threads")
      .select("id, page_url, status, created_at, created_by, resolved_at, screenshot_path, context")
      .eq("id", threadId)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("comments")
      .select("id, author_id, body, mentions, created_at, edited_at, deleted_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true }),
    readWorkspaceMembers(supabase, workspaceId),
  ]);
  if (thread.error !== null) {
    throw new Error("Could not read the thread.");
  }
  if (thread.data === null) {
    notFound();
  }
  if (commentRows.error !== null) {
    throw new Error("Could not read the comments.");
  }
  const data = thread.data;

  const screenshot =
    data.screenshot_path === null
      ? undefined
      : await readScreenshotState(supabase, data.screenshot_path);
  const pageHref = safeExternalHref(data.page_url);
  const author =
    members.find((member) => member.userId === data.created_by)?.displayName ?? FORMER_MEMBER_LABEL;
  const { webUrl } = getPublicEnv();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <Link href={workspacePath(workspaceId, "threads")} className={`${LINK_BUTTON_CLASS} w-fit`}>
          Back to threads
        </Link>
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold tracking-tight break-all">
            Thread on {pagePathLabel(data.page_url)}
          </h1>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm text-neutral-800">
            <dt className="font-medium text-neutral-700">Page</dt>
            <dd className="break-all">
              {pageHref === null ? (
                data.page_url
              ) : (
                <a
                  href={pageHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4"
                >
                  {data.page_url}
                </a>
              )}
            </dd>
            <dt className="font-medium text-neutral-700">Status</dt>
            <dd>{THREAD_STATUS_LABELS[data.status]}</dd>
            <dt className="font-medium text-neutral-700">Started</dt>
            <dd>
              {author}, <time dateTime={data.created_at}>{formatUtcDateTime(data.created_at)}</time>
            </dd>
            {data.resolved_at === null ? null : (
              <>
                <dt className="font-medium text-neutral-700">Resolved</dt>
                <dd>
                  <time dateTime={data.resolved_at}>{formatUtcDateTime(data.resolved_at)}</time>
                </dd>
              </>
            )}
          </dl>
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <ThreadStatusForm workspaceId={workspaceId} threadId={threadId} status={data.status} />
          <div className="min-w-0 flex-1">
            <CopyLink label="Thread link" value={`${webUrl}/t/${threadId}`} />
          </div>
        </div>
      </header>
      <section aria-labelledby="context-heading" className="flex flex-col gap-3">
        <h2 id="context-heading" className="text-lg font-semibold">
          Context
        </h2>
        <PageContext
          context={parseThreadContext(data.context)}
          hasScreenshot={data.screenshot_path !== null}
          screenshot={screenshot}
        />
      </section>
      <section aria-labelledby="comments-heading" className="flex flex-col gap-3">
        <h2 id="comments-heading" className="text-lg font-semibold">
          Comments
        </h2>
        <ThreadComments comments={toCommentViews(commentRows.data, members)} />
      </section>
    </div>
  );
}
