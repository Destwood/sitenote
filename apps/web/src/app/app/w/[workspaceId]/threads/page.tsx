import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { createSupabaseServerClient, getAuthenticatedUser } from "../../../../../supabase-server";
import { Pager } from "../../../../../pager";
import { pageCount } from "../../../../../pagination";
import { ThreadFilterForm } from "../../../../../thread-filter-form";
import {
  hasActiveFilters,
  parseThreadQuery,
  threadsHref,
  type ThreadSearchParams,
} from "../../../../../thread-filters";
import { searchThreads } from "../../../../../thread-search";
import { ThreadTable } from "../../../../../thread-table";
import { parseUuid } from "../../../../../uuid";
import { memberNames, readWorkspaceMembers } from "../../../../../workspace-members";

export const metadata: Metadata = {
  title: "Threads | Sitenote",
  referrer: "no-referrer",
};

interface ThreadsPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<ThreadSearchParams>;
}

export default async function ThreadsPage({ params, searchParams }: ThreadsPageProps) {
  const workspaceId = parseUuid((await params).workspaceId);
  if (workspaceId === null) {
    notFound();
  }
  const { filters, pageNumber } = parseThreadQuery(await searchParams);

  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (user === null) {
    redirect(`/sign-in?next=${encodeURIComponent(threadsHref(workspaceId, filters, pageNumber))}`);
  }
  const [members, sites, search] = await Promise.all([
    readWorkspaceMembers(supabase, workspaceId),
    supabase
      .from("sites")
      .select("id, origin")
      .eq("workspace_id", workspaceId)
      .order("origin", { ascending: true }),
    searchThreads(supabase, workspaceId, filters, pageNumber),
  ]);
  if (sites.error !== null) {
    throw new Error("Could not read the sites.");
  }
  const pages = pageCount(search.total);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Threads</h1>
        <p className="text-neutral-600">Comment threads from every site in this workspace.</p>
      </header>
      <ThreadFilterForm
        workspaceId={workspaceId}
        filters={filters}
        sites={sites.data}
        members={members}
      />
      <ThreadTable
        workspaceId={workspaceId}
        rows={search.rows}
        names={memberNames(members)}
        filtered={hasActiveFilters(filters)}
      />
      <Pager
        page={pageNumber}
        pages={pages}
        previousHref={pageNumber > 1 ? threadsHref(workspaceId, filters, pageNumber - 1) : null}
        nextHref={pageNumber < pages ? threadsHref(workspaceId, filters, pageNumber + 1) : null}
      />
    </div>
  );
}
