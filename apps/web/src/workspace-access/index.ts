import type { Enums, SitenoteClient } from "@sitenote/db";

export interface WorkspaceMembership {
  id: string;
  name: string;
  role: Enums<"member_role">;
}

export interface WorkspaceAccess {
  name: string;
  role: Enums<"member_role">;
}

export async function readMemberships(
  supabase: SitenoteClient,
  userId: string,
): Promise<WorkspaceMembership[] | null> {
  const { data, error } = await supabase
    .from("members")
    .select("role, workspaces(id, name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error !== null) {
    return null;
  }
  return data.map(({ role, workspaces: workspace }) => ({
    id: workspace.id,
    name: workspace.name,
    role,
  }));
}

export async function readWorkspaceAccess(
  supabase: SitenoteClient,
  userId: string,
  workspaceId: string,
): Promise<WorkspaceAccess | null> {
  const { data, error } = await supabase
    .from("members")
    .select("role, workspaces(name)")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error !== null) {
    throw new Error("Could not read the workspace membership.");
  }
  return data === null ? null : { name: data.workspaces.name, role: data.role };
}
