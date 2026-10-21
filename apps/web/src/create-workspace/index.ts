"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient, getAuthenticatedUser } from "../supabase-server";
import { parseWorkspaceName, WORKSPACE_NAME_MAX_LENGTH } from "../workspace-name";

export interface CreateWorkspaceState {
  error: string | null;
  name: string;
}

export async function createWorkspace(
  _previous: CreateWorkspaceState,
  formData: FormData,
): Promise<CreateWorkspaceState> {
  const submitted = formData.get("name");
  const name = parseWorkspaceName(submitted);
  const echo = typeof submitted === "string" ? submitted : "";
  if (name === null) {
    return {
      error: `Enter a workspace name of 1 to ${String(WORKSPACE_NAME_MAX_LENGTH)} characters.`,
      name: echo,
    };
  }

  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (user === null) {
    redirect("/sign-in?next=/app");
  }
  if (user.isAnonymous) {
    return { error: "Guests cannot create workspaces.", name: echo };
  }

  const { error } = await supabase.from("workspaces").insert({ name, owner_id: user.id });
  if (error !== null) {
    return { error: "We could not create the workspace. Try again.", name: echo };
  }

  revalidatePath("/app");
  return { error: null, name: "" };
}
