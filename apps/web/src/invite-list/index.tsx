import { Badge, type BadgeTone } from "../badge";
import { DASH_CARD_CLASS, DASH_EMPTY_CLASS } from "../dashboard-classes";
import { formatUtcDateTime } from "../format-utc";
import { INVITE_ROLE_LABELS, type InviteRole } from "../invite-options";
import { InviteRowActions } from "../invite-row-actions";
import type { InviteStatus } from "../invite-status";

export interface InviteListItem {
  id: string;
  role: InviteRole;
  createdAt: string;
  expiresAt: string;
  status: InviteStatus;
  link: string;
}

interface InviteListProps {
  workspaceId: string;
  invites: readonly InviteListItem[];
}

const STATUS_LABELS: Readonly<Record<InviteStatus, string>> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
};

const STATUS_TONES: Readonly<Record<InviteStatus, BadgeTone>> = {
  active: "green",
  expired: "gray",
  revoked: "red",
};

export function formatInviteDate(iso: string): string {
  return formatUtcDateTime(iso);
}

export function InviteList({ workspaceId, invites }: InviteListProps) {
  if (invites.length === 0) {
    return <p className={DASH_EMPTY_CLASS}>No invites yet.</p>;
  }

  return (
    <ul className={`${DASH_CARD_CLASS} divide-y divide-neutral-200`}>
      {invites.map((invite) => (
        <li key={invite.id} data-testid="invite-row" className="flex flex-col gap-3 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-neutral-900">
              {INVITE_ROLE_LABELS[invite.role]} invite
            </span>
            <Badge tone={STATUS_TONES[invite.status]}>{STATUS_LABELS[invite.status]}</Badge>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-neutral-600">
            <dt>Created</dt>
            <dd className="text-neutral-800">{formatInviteDate(invite.createdAt)}</dd>
            <dt>Expires</dt>
            <dd className="text-neutral-800">{formatInviteDate(invite.expiresAt)}</dd>
          </dl>
          {invite.status === "active" ? (
            <InviteRowActions workspaceId={workspaceId} inviteId={invite.id} link={invite.link} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
