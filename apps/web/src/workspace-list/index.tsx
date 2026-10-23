import type { Enums } from "@sitenote/db";
import Link from "next/link";

import { LINK_BUTTON_CLASS } from "../form-controls";
import { workspaceInvitesPath } from "../invite-link";
import { MEMBER_ROLE_LABELS } from "../member-roles";
import { workspacePath } from "../workspace-paths";

export interface WorkspaceListItem {
  id: string;
  name: string;
  role: Enums<"member_role">;
}

interface WorkspaceListProps {
  workspaces: readonly WorkspaceListItem[];
}

export function WorkspaceList({ workspaces }: WorkspaceListProps) {
  if (workspaces.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-neutral-300 px-4 py-6 text-center text-neutral-600">
        You are not in any workspace yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-neutral-200 rounded-md border border-neutral-200">
      {workspaces.map((workspace) => (
        <li key={workspace.id} className="flex items-center justify-between gap-4 px-4 py-3">
          <Link
            href={workspacePath(workspace.id)}
            className="font-medium underline-offset-4 hover:underline"
          >
            {workspace.name}
          </Link>
          <span className="flex items-center gap-3">
            {workspace.role === "owner" ? (
              <Link href={workspaceInvitesPath(workspace.id)} className={LINK_BUTTON_CLASS}>
                Invites
              </Link>
            ) : null}
            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-700">
              {MEMBER_ROLE_LABELS[workspace.role]}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
