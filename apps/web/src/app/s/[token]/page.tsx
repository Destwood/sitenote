import { isRecordedAction } from "@sitenote/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getPublicEnv } from "../../../env";
import { Logo } from "../../../logo";
import { OpenOnPage } from "../../../open-on-page";
import { PageContext } from "../../../page-context";
import { pagePathLabel } from "../../../page-path";
import { PUBLIC_BRAND_CLASS, PUBLIC_CANVAS_CLASS, PUBLIC_CARD_CLASS } from "../../../public-styles";
import { safeExternalHref } from "../../../safe-external-link";
import { readSharedThread } from "../../../share-access";
import { ThreadComments } from "../../../thread-comments";
import { ThreadFacts } from "../../../thread-facts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared record | Sitenote",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

interface SharedThreadPageProps {
  params: Promise<{ token: string }>;
}

export default async function SharedThreadPage({ params }: SharedThreadPageProps) {
  const { token } = await params;
  const detail = await readSharedThread(token);
  if (detail === null) {
    notFound();
  }
  const pageHref = safeExternalHref(detail.pageUrl);
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
          <p className="text-sm text-neutral-600">Shared record</p>
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
        {pageHref === null ? null : (
          <OpenOnPage
            pageUrl={pageHref}
            startUrl={detail.context?.recording?.startUrl}
            threadId={detail.id}
            extensionId={extensionId}
            hasSteps={detail.context?.recording?.steps?.some(isRecordedAction) === true}
          />
        )}
      </header>
      <section
        aria-labelledby="context-heading"
        className={`${PUBLIC_CARD_CLASS} flex flex-col gap-4 p-6`}
      >
        <h2 id="context-heading" className="text-lg font-semibold">
          Context
        </h2>
        <PageContext
          thread={{
            excerpt: detail.excerpt,
            authorName: detail.authorName,
            status: detail.status,
            pageUrl: detail.pageUrl,
            anchor: detail.anchor,
          }}
          context={detail.context}
          hasScreenshot={detail.hasScreenshot}
          screenshot={detail.screenshot}
          recording={detail.recording}
          largeVideo
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
