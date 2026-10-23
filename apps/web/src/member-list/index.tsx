import type { Enums } from "@sitenote/db";

import { ConfirmActionForm } from "../confirm-action-form";
import { formatUtcDateTime } from "../format-utc";
import { leaveWorkspace, removeMember } from "../member-actions";
import { MemberRoleForm } from "../member-role-form";
import { MEMBER_ROLE_LABELS, parseAssignableRole } from "../member-roles";
import type { WorkspaceMember } from "../workspace-members";

export const YOU_LABEL = "(you)";

export function removeMemberMessage(displayName: string): string {
  return `Remove ${displayName} from the workspace? Their threads and comments stay.`;
}

export const LEAVE_MESSAGE = "Leave this workspace? You will lose access to its threads.";

interface MemberListProps {
  workspaceId: string;
  members: readonly WorkspaceMember[];
  viewerId: string;
  viewerRole: Enums<"member_role">;
}

interface MemberControlsProps {
  workspaceId: string;
  member: WorkspaceMember;
  isViewer: boolean;
  viewerRole: Enums<"member_role">;
}

function MemberControls({ workspaceId, member, isViewer, viewerRole }: MemberControlsProps) {
  const assignableRole = parseAssignableRole(member.role);
  if (assignableRole !== null && viewerRole === "owner") {
    return (
      <div className="flex flex-col gap-3">
        <MemberRoleForm workspaceId={workspaceId} userId={member.userId} role={assignableRole} />
        <ConfirmActionForm
          action={removeMember}
          fields={{ workspaceId, userId: member.userId }}
          confirmMessage={removeMemberMessage(member.displayName)}
          label="Remove from workspace"
          pendingLabel="Removing..."
        />
      </div>
    );
  }
  if (isViewer && viewerRole !== "owner") {
    return (
      <ConfirmActionForm
        action={leaveWorkspace}
        fields={{ workspaceId }}
        confirmMessage={LEAVE_MESSAGE}
        label="Leave workspace"
        pendingLabel="Leaving..."
      />
    );
  }
  return null;
}

export function MemberList({ workspaceId, members, viewerId, viewerRole }: MemberListProps) {
  return (
    <ul className="flex flex-col divide-y divide-neutral-200 rounded-md border border-neutral-200">
      {members.map((member) => {
        const isViewer = member.userId === viewerId;
        return (
          <li
            key={member.userId}
            className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium break-words">
                {member.displayName} {isViewer ? YOU_LABEL : null}
              </span>
              <span className="text-sm text-neutral-600">
                {MEMBER_ROLE_LABELS[member.role]}, joined{" "}
                <time dateTime={member.joinedAt}>{formatUtcDateTime(member.joinedAt)}</time>
              </span>
            </div>
            <MemberControls
              workspaceId={workspaceId}
              member={member}
              isViewer={isViewer}
              viewerRole={viewerRole}
            />
          </li>
        );
      })}
    </ul>
  );
}
