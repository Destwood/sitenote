import type { Enums } from "@sitenote/db";

import { formatUtcDateTime } from "../format-utc";
import { safeExternalHref } from "../safe-external-link";
import { THREAD_STATUS_LABELS } from "../thread-status";

interface ThreadFactsProps {
  pageUrl: string;
  status: Enums<"thread_status">;
  authorName: string;
  createdAt: string;
  resolvedAt: string | null;
}

export function ThreadFacts({
  pageUrl,
  status,
  authorName,
  createdAt,
  resolvedAt,
}: ThreadFactsProps) {
  const pageHref = safeExternalHref(pageUrl);

  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm text-neutral-900">
      <dt className="text-neutral-500">Page</dt>
      <dd className="break-all">
        {pageHref === null ? (
          pageUrl
        ) : (
          <a
            href={pageHref}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            {pageUrl}
          </a>
        )}
      </dd>
      <dt className="text-neutral-500">Status</dt>
      <dd>{THREAD_STATUS_LABELS[status]}</dd>
      <dt className="text-neutral-500">Started</dt>
      <dd>
        {authorName}, <time dateTime={createdAt}>{formatUtcDateTime(createdAt)}</time>
      </dd>
      {resolvedAt === null ? null : (
        <>
          <dt className="text-neutral-500">Resolved</dt>
          <dd>
            <time dateTime={resolvedAt}>{formatUtcDateTime(resolvedAt)}</time>
          </dd>
        </>
      )}
    </dl>
  );
}
