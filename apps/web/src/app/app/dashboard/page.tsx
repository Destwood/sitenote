import { redirect } from "next/navigation";

import { createSupabaseServerClient, getAuthenticatedUser } from "../../../supabase-server";
import { readMemberships } from "../../../workspace-access";
import { workspacePath } from "../../../workspace-paths";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (user === null) {
    redirect("/sign-in?next=/app/dashboard");
  }

  const workspaces = await readMemberships(supabase, user.id);
  const firstWorkspace = workspaces?.[0];
  if (firstWorkspace === undefined) {
    redirect("/app");
  }
  redirect(workspacePath(firstWorkspace.id));
}
