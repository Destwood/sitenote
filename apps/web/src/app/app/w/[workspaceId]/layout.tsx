import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { AppAccount } from "../../../../app-header";
import { BrandLink } from "../../../../brand-mark";
import { getPublicEnv } from "../../../../env";
import { ExtensionUpdateBanner } from "../../../../extension-update-banner";
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
    <div className="min-h-screen bg-neutral-50 md:flex">
      <aside className="flex flex-col gap-4 border-b border-neutral-200 bg-white px-4 py-3 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:gap-5 md:overflow-y-auto md:border-r md:border-b-0 md:px-4 md:py-5">
        <BrandLink />
        <WorkspaceSwitcher currentId={workspaceId} workspaces={memberships} />
        <WorkspaceNav workspaceId={workspaceId} role={current.role} />
        <div className="mt-auto">
          <AppAccount displayName={displayName} canConnectExtension={!user.isAnonymous} />
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 md:py-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
          <ExtensionUpdateBanner extensionId={getPublicEnv().extensionId} />
          {children}
        </div>
      </main>
    </div>
  );
}
