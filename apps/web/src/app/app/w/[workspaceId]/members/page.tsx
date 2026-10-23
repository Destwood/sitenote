import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { MemberList } from "../../../../../member-list";
import { createSupabaseServerClient, getAuthenticatedUser } from "../../../../../supabase-server";
import { parseUuid } from "../../../../../uuid";
import { readWorkspaceAccess } from "../../../../../workspace-access";
import { readWorkspaceMembers } from "../../../../../workspace-members";
import { workspacePath } from "../../../../../workspace-paths";

export const metadata: Metadata = {
  title: "Members | Sitenote",
  referrer: "no-referrer",
};

interface MembersPageProps {
  params: Promise<{ workspaceId: string }>;
}

export default async function MembersPage({ params }: MembersPageProps) {
  const workspaceId = parseUuid((await params).workspaceId);
  if (workspaceId === null) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (user === null) {
    redirect(`/sign-in?next=${encodeURIComponent(workspacePath(workspaceId, "members"))}`);
  }

  const [access, members] = await Promise.all([
    readWorkspaceAccess(supabase, user.id, workspaceId),
    readWorkspaceMembers(supabase, workspaceId),
  ]);
  if (access === null) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Members</h1>
        <p className="text-neutral-600">
          {access.role === "owner"
            ? "Change roles, remove members or leave the workspace."
            : "Everyone in this workspace. You can leave it at any time."}
        </p>
      </header>
      <MemberList
        workspaceId={workspaceId}
        members={members}
        viewerId={user.id}
        viewerRole={access.role}
      />
    </div>
  );
}
