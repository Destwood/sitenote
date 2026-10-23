import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CreateInviteForm } from "../../../../../create-invite-form";
import { getPublicEnv } from "../../../../../env";
import { ERROR_CLASS, LINK_BUTTON_CLASS } from "../../../../../form-controls";
import { InviteList, type InviteListItem } from "../../../../../invite-list";
import { inviteLink, workspaceInvitesPath } from "../../../../../invite-link";
import { parseInviteRole } from "../../../../../invite-options";
import { inviteStatus } from "../../../../../invite-status";
import { currentTimeMs } from "../../../../../now";
import { createSupabaseServerClient, getAuthenticatedUser } from "../../../../../supabase-server";
import { parseUuid } from "../../../../../uuid";
import { readWorkspaceAccess } from "../../../../../workspace-access";

export const metadata: Metadata = {
  title: "Invites | Sitenote",
  referrer: "no-referrer",
};

interface InvitesPageProps {
  params: Promise<{ workspaceId: string }>;
}

export default async function InvitesPage({ params }: InvitesPageProps) {
  const workspaceId = parseUuid((await params).workspaceId);
  if (workspaceId === null) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (user === null) {
    redirect(`/sign-in?next=${encodeURIComponent(workspaceInvitesPath(workspaceId))}`);
  }

  const [access, invites] = await Promise.all([
    readWorkspaceAccess(supabase, user.id, workspaceId),
    supabase
      .from("invites")
      .select("id, role, token, created_at, expires_at, revoked_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false }),
  ]);
  if (access?.role !== "owner") {
    notFound();
  }

  const { webUrl } = getPublicEnv();
  const now = currentTimeMs();
  const items: InviteListItem[] = (invites.data ?? []).flatMap((invite) => {
    const role = parseInviteRole(invite.role);
    return role === null
      ? []
      : [
          {
            id: invite.id,
            role,
            createdAt: invite.created_at,
            expiresAt: invite.expires_at,
            status: inviteStatus(invite, now),
            link: inviteLink(webUrl, invite.token),
          },
        ];
  });

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link href="/app" className={`${LINK_BUTTON_CLASS} w-fit`}>
          Back to workspaces
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Invites for {access.name}</h1>
        <p className="text-neutral-600">
          Anyone with an active link can join until it expires or you revoke it. Guests join with a
          display name only; members sign in with their email.
        </p>
      </header>
      <CreateInviteForm workspaceId={workspaceId} />
      <section aria-labelledby="invites-heading" className="flex flex-col gap-4">
        <h2 id="invites-heading" className="text-lg font-semibold">
          Invite links
        </h2>
        {invites.error === null ? (
          <InviteList workspaceId={workspaceId} invites={items} />
        ) : (
          <p role="alert" className={ERROR_CLASS}>
            We could not load the invites. Reload the page to try again.
          </p>
        )}
      </section>
    </div>
  );
}
