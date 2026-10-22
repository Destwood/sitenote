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

const STATUS_CLASSES: Readonly<Record<InviteStatus, string>> = {
  active: "bg-green-100 text-green-800",
  expired: "bg-neutral-100 text-neutral-700",
  revoked: "bg-red-100 text-red-800",
};

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function formatInviteDate(iso: string): string {
  return `${DATE_FORMAT.format(new Date(iso))} UTC`;
}

export function InviteList({ workspaceId, invites }: InviteListProps) {
  if (invites.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-neutral-300 px-4 py-6 text-center text-neutral-600">
        No invites yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-neutral-200 rounded-md border border-neutral-200">
      {invites.map((invite) => (
        <li key={invite.id} data-testid="invite-row" className="flex flex-col gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{INVITE_ROLE_LABELS[invite.role]} invite</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASSES[invite.status]}`}
            >
              {STATUS_LABELS[invite.status]}
            </span>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-neutral-700">
            <dt>Created</dt>
            <dd>{formatInviteDate(invite.createdAt)}</dd>
            <dt>Expires</dt>
            <dd>{formatInviteDate(invite.expiresAt)}</dd>
          </dl>
          {invite.status === "active" ? (
            <InviteRowActions workspaceId={workspaceId} inviteId={invite.id} link={invite.link} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
