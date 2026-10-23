import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { isClickUpConfigured } from "../../../../../../clickup-api";
import { ClickUpTaskPanel } from "../../../../../../clickup-task-panel";
import { CopyLink } from "../../../../../../copy-link";
import { getPublicEnv } from "../../../../../../env";
import { LINK_BUTTON_CLASS } from "../../../../../../form-controls";
import { PageContext } from "../../../../../../page-context";
import { pagePathLabel } from "../../../../../../page-path";
import {
  createSupabaseServerClient,
  getAuthenticatedUser,
} from "../../../../../../supabase-server";
import { ThreadComments } from "../../../../../../thread-comments";
import { readThreadDetail } from "../../../../../../thread-detail";
import { ThreadFacts } from "../../../../../../thread-facts";
import { ThreadStatusForm } from "../../../../../../thread-status-form";
import { parseUuid } from "../../../../../../uuid";
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

  const detail = await readThreadDetail(supabase, threadId, workspaceId);
  if (detail === null) {
    notFound();
  }
  const canCreateClickUpTask = await isClickUpConfigured(supabase, workspaceId);
  const { webUrl } = getPublicEnv();

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <Link href={workspacePath(workspaceId, "threads")} className={`${LINK_BUTTON_CLASS} w-fit`}>
          Back to threads
        </Link>
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold tracking-tight break-all">
            Thread on {pagePathLabel(detail.pageUrl)}
          </h1>
          <ThreadFacts
            pageUrl={detail.pageUrl}
            status={detail.status}
            authorName={detail.authorName}
            createdAt={detail.createdAt}
            resolvedAt={detail.resolvedAt}
          />
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <ThreadStatusForm workspaceId={workspaceId} threadId={threadId} status={detail.status} />
          <div className="min-w-0 flex-1">
            <CopyLink label="Thread link" value={`${webUrl}/t/${threadId}`} />
          </div>
        </div>
        <ClickUpTaskPanel
          threadId={threadId}
          taskUrl={detail.clickUpTaskUrl}
          canCreate={canCreateClickUpTask}
        />
      </header>
      <section aria-labelledby="context-heading" className="flex flex-col gap-3">
        <h2 id="context-heading" className="text-lg font-semibold">
          Context
        </h2>
        <PageContext
          context={detail.context}
          hasScreenshot={detail.hasScreenshot}
          screenshot={detail.screenshot}
        />
      </section>
      <section aria-labelledby="comments-heading" className="flex flex-col gap-3">
        <h2 id="comments-heading" className="text-lg font-semibold">
          Comments
        </h2>
        <ThreadComments comments={detail.comments} />
      </section>
    </div>
  );
}
