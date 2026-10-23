import type { Enums, SitenoteClient } from "@sitenote/db";

export interface WorkspaceMember {
  userId: string;
  displayName: string;
  role: Enums<"member_role">;
  joinedAt: string;
}

export async function readWorkspaceMembers(
  supabase: SitenoteClient,
  workspaceId: string,
): Promise<WorkspaceMember[]> {
  const { data, error } = await supabase
    .from("members")
    .select("user_id, role, created_at, profiles(display_name)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error !== null) {
    throw new Error("Could not read the workspace members.");
  }
  return data.map(({ user_id: userId, role, created_at: joinedAt, profiles: profile }) => ({
    userId,
    displayName: profile.display_name,
    role,
    joinedAt,
  }));
}

export function memberNames(members: readonly WorkspaceMember[]): ReadonlyMap<string, string> {
  return new Map(members.map((member) => [member.userId, member.displayName]));
}
