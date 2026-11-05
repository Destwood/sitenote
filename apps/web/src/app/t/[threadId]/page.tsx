import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { isClickUpConfigured } from "../../../clickup-api";
import { ClickUpTaskPanel } from "../../../clickup-task-panel";
import { getPublicEnv } from "../../../env";
import { isJiraConfigured } from "../../../jira-api";
import { JiraIssuePanel } from "../../../jira-issue-panel";
import { Logo } from "../../../logo";
import { OpenOnPage } from "../../../open-on-page";
import { PageContext } from "../../../page-context";
import { pagePathLabel } from "../../../page-path";
import {
  PUBLIC_BRAND_CLASS,
  PUBLIC_CANVAS_CLASS,
  PUBLIC_CARD_CLASS,
  PUBLIC_LINK_BUTTON_CLASS,
} from "../../../public-styles";
import { safeExternalHref } from "../../../safe-external-link";
import { createSupabaseServerClient, getAuthenticatedUser } from "../../../supabase-server";
import { ThreadComments } from "../../../thread-comments";
import { readThreadDetail } from "../../../thread-detail";
import { ThreadFacts } from "../../../thread-facts";
import { parseUuid } from "../../../uuid";
import { readWorkspaceAccess } from "../../../workspace-access";
import { threadPath } from "../../../workspace-paths";

export const metadata: Metadata = {
  title: "Thread | Sitenote",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

interface ThreadLinkPageProps {
  params: Promise<{ threadId: string }>;
}

export default async function ThreadLinkPage({ params }: ThreadLinkPageProps) {
  const { threadId: rawThreadId } = await params;
  const threadId = parseUuid(rawThreadId);
  if (threadId === null) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (user === null) {
    redirect(`/sign-in?next=${encodeURIComponent(`/t/${threadId}`)}`);
  }

  const detail = await readThreadDetail(supabase, threadId);
  if (detail === null) {
    notFound();
  }
  const access = await readWorkspaceAccess(supabase, user.id, detail.workspaceId);
  if (access === null) {
    notFound();
  }
  const pageHref = safeExternalHref(detail.pageUrl);
  const canCreateClickUpTask = await isClickUpConfigured(supabase, detail.workspaceId);
  const canLinkJira = await isJiraConfigured(supabase, detail.workspaceId);
  const { extensionId } = getPublicEnv();

  return (
    <main
      className={`${PUBLIC_CANVAS_CLASS} mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12`}
    >
      <Link href="/" className={PUBLIC_BRAND_CLASS}>
        <Logo size={32} />
        Sitenote
      </Link>
      <header className={`${PUBLIC_CARD_CLASS} flex flex-col gap-5 p-6`}>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-neutral-600 break-all">{access.name}</p>
          <h1 className="text-2xl font-bold tracking-tight break-all">
            Thread on {pagePathLabel(detail.pageUrl)}
          </h1>
        </div>
        <ThreadFacts
          pageUrl={detail.pageUrl}
          status={detail.status}
          authorName={detail.authorName}
          createdAt={detail.createdAt}
          resolvedAt={detail.resolvedAt}
        />
        <div className="flex flex-col gap-4">
          {pageHref === null ? null : (
            <OpenOnPage pageUrl={pageHref} threadId={threadId} extensionId={extensionId} />
          )}
          <ClickUpTaskPanel
            threadId={threadId}
            taskUrl={detail.clickUpTaskUrl}
            canCreate={canCreateClickUpTask}
          />
          <JiraIssuePanel
            threadId={threadId}
            issueKey={detail.jiraIssueKey}
            issueUrl={detail.jiraIssueUrl}
            canLink={canLinkJira}
          />
          <Link
            href={threadPath(detail.workspaceId, threadId)}
            className={`${PUBLIC_LINK_BUTTON_CLASS} w-fit`}
          >
            Open in dashboard
          </Link>
        </div>
      </header>
      <section
        aria-labelledby="context-heading"
        className={`${PUBLIC_CARD_CLASS} flex flex-col gap-4 p-6`}
      >
        <h2 id="context-heading" className="text-lg font-semibold">
          Context
        </h2>
        <PageContext
          context={detail.context}
          hasScreenshot={detail.hasScreenshot}
          screenshot={detail.screenshot}
          recording={detail.recording}
        />
      </section>
      <section
        aria-labelledby="comments-heading"
        className={`${PUBLIC_CARD_CLASS} flex flex-col gap-4 p-6`}
      >
        <h2 id="comments-heading" className="text-lg font-semibold">
          Comments
        </h2>
        <ThreadComments comments={detail.comments} />
      </section>
    </main>
  );
}
