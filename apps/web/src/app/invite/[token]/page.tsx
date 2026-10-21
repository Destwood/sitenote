import type { SitenoteClient } from "@sitenote/db";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { AcceptInviteForm } from "../../../accept-invite-form";
import { getPublicEnv } from "../../../env";
import { ERROR_CLASS, PRIMARY_BUTTON_CLASS } from "../../../form-controls";
import { GuestJoin } from "../../../guest-join";
import { INVALID_INVITE_MESSAGE } from "../../../invite-error";
import { inviteSignInPath, isInviteToken } from "../../../invite-link";
import { INVITE_ROLE_LABELS, parseInviteRole, type InviteRole } from "../../../invite-options";
import { createSupabaseServerClient, getAuthenticatedUser } from "../../../supabase-server";

export const metadata: Metadata = {
  title: "Join a workspace | Sitenote",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

type Preview =
  | { kind: "valid"; workspaceName: string; role: InviteRole }
  | { kind: "invalid" }
  | { kind: "unavailable" };

async function readPreview(supabase: SitenoteClient, token: string): Promise<Preview> {
  if (!isInviteToken(token)) {
    return { kind: "invalid" };
  }
  const { data, error } = await supabase.rpc("invite_preview", { p_token: token });
  if (error !== null) {
    return { kind: "unavailable" };
  }
  const row = data[0];
  const role = parseInviteRole(row?.role);
  if (row?.valid !== true || role === null) {
    return { kind: "invalid" };
  }
  return { kind: "valid", workspaceName: row.workspace_name, role };
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-8 px-6 py-16">
      <Link href="/" className="w-fit text-lg font-bold tracking-tight">
        Sitenote
      </Link>
      {children}
    </main>
  );
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  const supabase = await createSupabaseServerClient();
  const [user, preview] = await Promise.all([
    getAuthenticatedUser(supabase),
    readPreview(supabase, token),
  ]);

  if (preview.kind === "invalid") {
    return (
      <Shell>
        <h1 className="text-2xl font-bold tracking-tight">Invite link</h1>
        <p role="alert" className={ERROR_CLASS}>
          {INVALID_INVITE_MESSAGE}
        </p>
      </Shell>
    );
  }
  if (preview.kind === "unavailable") {
    return (
      <Shell>
        <h1 className="text-2xl font-bold tracking-tight">Invite link</h1>
        <p role="alert" className={ERROR_CLASS}>
          We could not check this invite. Reload the page to try again.
        </p>
      </Shell>
    );
  }

  const { workspaceName, role } = preview;

  if (user !== null && !user.isAnonymous) {
    return (
      <Shell>
        <AcceptInviteForm token={token} workspaceName={workspaceName} role={role} />
      </Shell>
    );
  }
  if (role === "guest") {
    return (
      <Shell>
        <GuestJoin
          token={token}
          workspaceName={workspaceName}
          extensionId={getPublicEnv().extensionId}
        />
      </Shell>
    );
  }
  return (
    <Shell>
      <h1 className="text-2xl font-bold tracking-tight">
        You have been invited to {workspaceName}
      </h1>
      <p className="text-neutral-600">
        This invite is for a {INVITE_ROLE_LABELS[role].toLowerCase()}. Sign in with your email to
        join.
      </p>
      <Link href={inviteSignInPath(token)} className={`${PRIMARY_BUTTON_CLASS} w-fit`}>
        Sign in to join
      </Link>
    </Shell>
  );
}
