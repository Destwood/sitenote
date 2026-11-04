import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "../badge";
import { DASH_CARD_CLASS, DASH_EMPTY_CLASS, DASH_LINK_CLASS } from "../dashboard-classes";
import { DashIcon } from "../dashboard-icons";
import { formatUtcDateTime } from "../format-utc";
import { pagePathLabel } from "../page-path";
import { THREAD_STATUS_LABELS } from "../thread-status";
import type { ThreadRow } from "../thread-search";
import { threadPath } from "../workspace-paths";

export const FORMER_MEMBER_LABEL = "Former member";
export const NO_THREADS_TEXT = "No threads yet. Comments left on your sites appear here.";
export const NO_MATCHES_TEXT = "No threads match these filters.";

const HEAD_CELL_CLASS =
  "px-4 py-2.5 text-left text-xs font-medium tracking-wide whitespace-nowrap text-neutral-500 uppercase";

interface ThreadTableProps {
  workspaceId: string;
  rows: readonly ThreadRow[];
  names: ReadonlyMap<string, string>;
  filtered: boolean;
  footer?: ReactNode;
}

export function ThreadTable({ workspaceId, rows, names, filtered, footer }: ThreadTableProps) {
  if (rows.length === 0) {
    return (
      <>
        <p className={DASH_EMPTY_CLASS}>{filtered ? NO_MATCHES_TEXT : NO_THREADS_TEXT}</p>
        {footer}
      </>
    );
  }

  return (
    <div className={DASH_CARD_CLASS}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50">
            <tr>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Page
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                First comment
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Author
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Status
              </th>
              <th scope="col" className={`${HEAD_CELL_CLASS} text-right`}>
                Comments
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Created
              </th>
              <th scope="col" className={HEAD_CELL_CLASS}>
                Last activity
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {rows.map((row) => (
              <tr key={row.id} className="align-top transition-colors hover:bg-neutral-50">
                <td className="max-w-xs px-4 py-3 font-medium break-all">
                  <Link
                    href={threadPath(workspaceId, row.id)}
                    className={`${DASH_LINK_CLASS} inline-flex items-start gap-1.5 text-neutral-900`}
                  >
                    <DashIcon name="globe" className="mt-0.5 size-3.5 text-neutral-500" />
                    {pagePathLabel(row.pageUrl)}
                  </Link>
                </td>
                <td className="max-w-xs px-4 py-3 break-words text-neutral-800">{row.firstBody}</td>
                <td className="px-4 py-3 whitespace-nowrap text-neutral-700">
                  {names.get(row.createdBy) ?? FORMER_MEMBER_LABEL}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={row.status === "open" ? "blue" : "gray"}>
                    {THREAD_STATUS_LABELS[row.status]}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-neutral-700">
                  {row.commentCount}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-neutral-700">
                  <time dateTime={row.createdAt}>{formatUtcDateTime(row.createdAt)}</time>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-neutral-700">
                  <time dateTime={row.lastActivity}>{formatUtcDateTime(row.lastActivity)}</time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}
