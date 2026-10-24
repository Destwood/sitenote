import type { SitenoteClient } from "@sitenote/db";

export const DEMO_NAME_MAX_LENGTH = 40;

export function parseDemoName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  const length = Array.from(trimmed).length;
  return length >= 1 && length <= DEMO_NAME_MAX_LENGTH ? trimmed : null;
}

export async function readVisitorName(client: SitenoteClient): Promise<string | null> {
  const session = await client.auth.getSession();
  const userId = session.data.session?.user.id;
  if (userId === undefined) {
    return null;
  }
  const profile = await client
    .from("profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();
  return profile.error === null && profile.data !== null ? profile.data.display_name : null;
}

export async function startVisit(client: SitenoteClient, displayName: string): Promise<void> {
  const session = await client.auth.getSession();
  if (session.data.session === null) {
    const started = await client.auth.signInAnonymously();
    if (started.error !== null) {
      throw new Error("The demo could not start a guest session.");
    }
  }
  const joined = await client.rpc("join_demo", { p_display_name: displayName });
  if (joined.error !== null) {
    throw new Error("The demo could not add the guest to the workspace.");
  }
}

export async function enterSite(client: SitenoteClient, origin: string): Promise<void> {
  const site = await client.rpc("demo_site", { p_origin: origin });
  if (site.error !== null) {
    throw new Error("The demo could not register this page.");
  }
}
