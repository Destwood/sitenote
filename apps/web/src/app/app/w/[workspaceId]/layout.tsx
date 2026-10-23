import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { AppHeader } from "../../../../app-header";
import { createSupabaseServerClient, getAuthenticatedUser } from "../../../../supabase-server";
import { parseUuid } from "../../../../uuid";
import { readMemberships } from "../../../../workspace-access";
import { WorkspaceNav } from "../../../../workspace-nav";
import { WorkspaceSwitcher } from "../../../../workspace-switcher";

interface WorkspaceLayoutProps {
  children: ReactNode;
  params: Promise<{ workspaceId: string }>;
}

export default async function WorkspaceLayout({ children, params }: WorkspaceLayoutProps) {
  const workspaceId = parseUuid((await params).workspaceId);
  if (workspaceId === null) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (user === null) {
    return <>{children}</>;
  }

  const [profile, memberships] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
    readMemberships(supabase, user.id),
  ]);
  if (memberships === null) {
    throw new Error("Could not read your workspaces.");
  }
  const current = memberships.find((workspace) => workspace.id === workspaceId);
  if (current === undefined) {
    notFound();
  }
  const displayName = profile.data?.display_name ?? user.email ?? "Account";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <AppHeader displayName={displayName} canConnectExtension={!user.isAnonymous} />
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
        <aside className="flex flex-col gap-4 md:w-52 md:shrink-0">
          <WorkspaceSwitcher currentId={workspaceId} workspaces={memberships} />
          <WorkspaceNav workspaceId={workspaceId} role={current.role} />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
