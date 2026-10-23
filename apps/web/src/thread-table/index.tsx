import Link from "next/link";

import { formatUtcDateTime } from "../format-utc";
import { pagePathLabel } from "../page-path";
import { threadPath } from "../workspace-paths";
import { THREAD_STATUS_LABELS } from "../thread-status";
import type { ThreadRow } from "../thread-search";

export const FORMER_MEMBER_LABEL = "Former member";
export const NO_THREADS_TEXT = "No threads yet. Comments left on your sites appear here.";
export const NO_MATCHES_TEXT = "No threads match these filters.";

interface ThreadTableProps {
  workspaceId: string;
  rows: readonly ThreadRow[];
  names: ReadonlyMap<string, string>;
  filtered: boolean;
}

export function ThreadTable({ workspaceId, rows, names, filtered }: ThreadTableProps) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-neutral-300 px-4 py-6 text-center text-neutral-600">
        {filtered ? NO_MATCHES_TEXT : NO_THREADS_TEXT}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-neutral-200">
      <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
        <thead className="bg-neutral-50 text-neutral-700">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">
              Page
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              First comment
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Author
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Status
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              Comments
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Created
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Last activity
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-neutral-200 align-top">
              <td className="px-3 py-2 font-medium break-all">
                <Link
                  href={threadPath(workspaceId, row.id)}
                  className="underline underline-offset-4 hover:text-neutral-700"
                >
                  {pagePathLabel(row.pageUrl)}
                </Link>
              </td>
              <td className="max-w-xs px-3 py-2 break-words text-neutral-800">{row.firstBody}</td>
              <td className="px-3 py-2 text-neutral-700">
                {names.get(row.createdBy) ?? FORMER_MEMBER_LABEL}
              </td>
              <td className="px-3 py-2 text-neutral-700">{THREAD_STATUS_LABELS[row.status]}</td>
              <td className="px-3 py-2 text-right tabular-nums">{row.commentCount}</td>
              <td className="px-3 py-2 whitespace-nowrap text-neutral-700">
                <time dateTime={row.createdAt}>{formatUtcDateTime(row.createdAt)}</time>
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-neutral-700">
                <time dateTime={row.lastActivity}>{formatUtcDateTime(row.lastActivity)}</time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
