export type InviteStatus = "active" | "expired" | "revoked";

interface InviteLifetime {
  expires_at: string;
  revoked_at: string | null;
}

export function inviteStatus(invite: InviteLifetime, nowMs: number): InviteStatus {
  if (invite.revoked_at !== null) {
    return "revoked";
  }
  return new Date(invite.expires_at).getTime() > nowMs ? "active" : "expired";
}
