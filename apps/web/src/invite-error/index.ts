export const INVALID_INVITE_MESSAGE = "This invite link is invalid or has expired.";

const NOT_SIGNED_IN = "28000";
const INVALID_INVITE = "22023";
const MEMBER_INVITE_FOR_GUEST = "42501";

export function describeInviteError(code: string | undefined): string {
  switch (code) {
    case INVALID_INVITE:
      return INVALID_INVITE_MESSAGE;
    case MEMBER_INVITE_FOR_GUEST:
      return "This invite is for team members. Sign in with your email to accept it.";
    case NOT_SIGNED_IN:
      return "Your session has ended. Reload the page and try again.";
    default:
      return "We could not accept the invite. Try again.";
  }
}
