import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppHeader } from "../../app-header";
import { CreateWorkspaceForm } from "../../create-workspace-form";
import { ERROR_CLASS } from "../../form-controls";
import { createSupabaseServerClient, getAuthenticatedUser } from "../../supabase-server";
import { readMemberships } from "../../workspace-access";
import { WorkspaceList } from "../../workspace-list";

export const metadata: Metadata = {
  title: "Workspaces | Sitenote",
};

export default async function AppPage() {
  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (user === null) {
    redirect("/sign-in?next=/app");
  }

  const [profile, workspaces] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
    readMemberships(supabase, user.id),
  ]);
  const displayName = profile.data?.display_name ?? user.email ?? "Account";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-8">
      <AppHeader displayName={displayName} canConnectExtension={!user.isAnonymous} />
      <main className="flex flex-col gap-8">
        <section aria-labelledby="workspaces-heading" className="flex flex-col gap-4">
          <h1 id="workspaces-heading" className="text-2xl font-bold tracking-tight">
            Your workspaces
          </h1>
          {workspaces === null ? (
            <p role="alert" className={ERROR_CLASS}>
              We could not load your workspaces. Reload the page to try again.
            </p>
          ) : (
            <WorkspaceList workspaces={workspaces} />
          )}
        </section>
        {user.isAnonymous ? (
          <p className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-neutral-700">
            Guests cannot create workspaces. Sign in with your email to create your own.
          </p>
        ) : (
          <CreateWorkspaceForm />
        )}
      </main>
    </div>
  );
}
