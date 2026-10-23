import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { createSupabaseServerClient, getAuthenticatedUser } from "../../../../../supabase-server";
import { parseUuid } from "../../../../../uuid";
import { readWorkspaceAccess } from "../../../../../workspace-access";
import { workspacePath } from "../../../../../workspace-paths";
import { SiteList } from "../../../../../site-list";

export const metadata: Metadata = {
  title: "Sites | Sitenote",
  referrer: "no-referrer",
};

interface SitesPageProps {
  params: Promise<{ workspaceId: string }>;
}

export default async function SitesPage({ params }: SitesPageProps) {
  const workspaceId = parseUuid((await params).workspaceId);
  if (workspaceId === null) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (user === null) {
    redirect(`/sign-in?next=${encodeURIComponent(workspacePath(workspaceId, "sites"))}`);
  }

  const [access, sites] = await Promise.all([
    readWorkspaceAccess(supabase, user.id, workspaceId),
    supabase
      .from("sites")
      .select("id, origin, threads(count)")
      .eq("workspace_id", workspaceId)
      .order("origin", { ascending: true }),
  ]);
  if (access === null) {
    notFound();
  }
  if (sites.error !== null) {
    throw new Error("Could not read the sites.");
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Sites</h1>
        <p className="text-neutral-600">
          Every origin where your team has left comments. Removing a site also deletes its threads.
        </p>
      </header>
      <SiteList
        workspaceId={workspaceId}
        sites={sites.data.map((site) => ({
          id: site.id,
          origin: site.origin,
          threadCount: site.threads[0]?.count ?? 0,
        }))}
        canManage={access.role === "owner"}
      />
    </div>
  );
}
