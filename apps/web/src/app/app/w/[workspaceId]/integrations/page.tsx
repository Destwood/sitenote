import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { readClickUpConnection } from "../../../../../clickup-api";
import { ClickUpIntegrationForm } from "../../../../../clickup-integration-form";
import { createSupabaseServerClient, getAuthenticatedUser } from "../../../../../supabase-server";
import { parseUuid } from "../../../../../uuid";
import { readWorkspaceAccess } from "../../../../../workspace-access";
import { workspacePath } from "../../../../../workspace-paths";

export const metadata: Metadata = {
  title: "Integrations | Sitenote",
  referrer: "no-referrer",
};

interface IntegrationsPageProps {
  params: Promise<{ workspaceId: string }>;
}

export default async function IntegrationsPage({ params }: IntegrationsPageProps) {
  const workspaceId = parseUuid((await params).workspaceId);
  if (workspaceId === null) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (user === null) {
    redirect(`/sign-in?next=${encodeURIComponent(workspacePath(workspaceId, "integrations"))}`);
  }

  const access = await readWorkspaceAccess(supabase, user.id, workspaceId);
  if (access?.role !== "owner") {
    notFound();
  }

  const integration = await supabase
    .from("integrations")
    .select("settings")
    .eq("workspace_id", workspaceId)
    .eq("provider", "clickup")
    .maybeSingle();
  if (integration.error !== null) {
    throw new Error("Could not read the integrations.");
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
        <p className="text-neutral-600">
          Create a ClickUp task from any comment. The token is stored in Supabase Vault and is never
          shown again.
        </p>
      </header>
      <section aria-labelledby="clickup-heading" className="flex flex-col gap-4">
        <h2 id="clickup-heading" className="text-xl font-semibold">
          ClickUp
        </h2>
        <ClickUpIntegrationForm
          workspaceId={workspaceId}
          connection={
            integration.data === null ? null : readClickUpConnection(integration.data.settings)
          }
        />
      </section>
    </div>
  );
}
