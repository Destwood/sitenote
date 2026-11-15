import { createSupabaseServerClient, getAuthenticatedUser } from "../supabase-server";

export async function isSignedIn(): Promise<boolean> {
  try {
    const user = await getAuthenticatedUser(await createSupabaseServerClient());
    return user !== null && !user.isAnonymous;
  } catch {
    return false;
  }
}
