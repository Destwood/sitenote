import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { isClickUpConfigured } from "../../../../../../clickup-api";
import { ClickUpTaskPanel } from "../../../../../../clickup-task-panel";
import { CopyLink } from "../../../../../../copy-link";
import { getPublicEnv } from "../../../../../../env";
import { DASH_CARD_CLASS, DASH_LINK_CLASS } from "../../../../../../dashboard-classes";
import { PageContext } from "../../../../../../page-context";
import { PageHeader } from "../../../../../../page-header";
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
    <div className="flex flex-col gap-6">
      <PageHeader
        leading={
          <Link href={workspacePath(workspaceId, "threads")} className={`${DASH_LINK_CLASS} w-fit`}>
            Back to threads
          </Link>
        }
        title={`Thread on ${pagePathLabel(detail.pageUrl)}`}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <section
            aria-labelledby="context-heading"
            className={`${DASH_CARD_CLASS} flex flex-col gap-4 p-5`}
          >
            <h2 id="context-heading" className="text-base font-semibold text-neutral-900">
              Context
            </h2>
            <PageContext
              context={detail.context}
              hasScreenshot={detail.hasScreenshot}
              screenshot={detail.screenshot}
            />
          </section>
          <section
            aria-labelledby="comments-heading"
            className={`${DASH_CARD_CLASS} flex flex-col gap-4 p-5`}
          >
            <h2 id="comments-heading" className="text-base font-semibold text-neutral-900">
              Comments
            </h2>
            <ThreadComments comments={detail.comments} />
          </section>
        </div>
        <aside className="flex flex-col gap-6">
          <section className={`${DASH_CARD_CLASS} flex flex-col gap-4 p-5`}>
            <h2 className="text-base font-semibold text-neutral-900">Details</h2>
            <ThreadFacts
              pageUrl={detail.pageUrl}
              status={detail.status}
              authorName={detail.authorName}
              createdAt={detail.createdAt}
              resolvedAt={detail.resolvedAt}
            />
            <ThreadStatusForm
              workspaceId={workspaceId}
              threadId={threadId}
              status={detail.status}
            />
          </section>
          <section className={`${DASH_CARD_CLASS} flex flex-col gap-4 p-5`}>
            <CopyLink label="Thread link" value={`${webUrl}/t/${threadId}`} />
          </section>
          <ClickUpTaskPanel
            threadId={threadId}
            taskUrl={detail.clickUpTaskUrl}
            canCreate={canCreateClickUpTask}
          />
        </aside>
      </div>
    </div>
  );
}
