import type { SitenoteClient } from "@sitenote/db";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";

import { failure, success, type MessageResult } from "../messages";

export interface HandoffTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SessionHandoffDeps {
  client: SitenoteClient;
  createProbe: (accessToken: string) => SitenoteClient;
}

export interface SessionHandoff {
  accept: (tokens: HandoffTokens) => Promise<MessageResult<null>>;
}

export function createSessionHandoff(deps: SessionHandoffDeps): SessionHandoff {
  const { client } = deps;

  async function accept({
    accessToken,
    refreshToken,
  }: HandoffTokens): Promise<MessageResult<null>> {
    try {
      const current = await client.auth.getSession();
      if (current.data.session !== null && current.data.session.user.is_anonymous !== true) {
        return failure("already_signed_in");
      }

      const probe = deps.createProbe(accessToken);
      const identity = await probe.auth.getUser(accessToken);
      if (identity.error !== null) {
        return failure(isAuthRetryableFetchError(identity.error) ? "network" : "session_rejected");
      }
      if (identity.data.user.is_anonymous !== true) {
        return failure("session_rejected");
      }

      const memberships = await probe
        .from("members")
        .select("workspace_id")
        .eq("user_id", identity.data.user.id)
        .limit(1);
      if (memberships.error !== null || memberships.data.length === 0) {
        return failure("session_rejected");
      }

      const stored = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      return stored.error === null ? success(null) : failure("session_rejected");
    } catch {
      return failure("unknown");
    }
  }

  return { accept };
}
