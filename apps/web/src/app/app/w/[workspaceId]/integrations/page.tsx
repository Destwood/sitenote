import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { readClickUpConnection } from "../../../../../clickup-api";
import { ClickUpIntegrationForm } from "../../../../../clickup-integration-form";
import { PageHeader } from "../../../../../page-header";
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
      <PageHeader
        title="Integrations"
        description="Create a ClickUp task from any comment. The token is stored in Supabase Vault and is never shown again."
      />
      <section
        aria-labelledby="clickup-heading"
        className="flex flex-col gap-5 rounded-lg border border-neutral-200 bg-white p-5"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-sm font-bold text-white">
            C
          </span>
          <h2 id="clickup-heading" className="text-base font-semibold text-neutral-900">
            ClickUp
          </h2>
        </div>
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
