const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isInviteToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

export function invitePath(token: string): string {
  return `/invite/${token}`;
}

export function inviteLink(webUrl: string, token: string): string {
  return `${webUrl}${invitePath(token)}`;
}

export function inviteSignInPath(token: string): string {
  return `/sign-in?next=${encodeURIComponent(invitePath(token))}`;
}

export function workspaceInvitesPath(workspaceId: string): string {
  return `/app/w/${workspaceId}/invites`;
}
