import type { Enums } from "@sitenote/db";
import Link from "next/link";

import { Badge } from "../badge";
import { DASH_CARD_CLASS, DASH_EMPTY_CLASS, DASH_LINK_CLASS } from "../dashboard-classes";
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
    return <p className={DASH_EMPTY_CLASS}>You are not in any workspace yet.</p>;
  }

  return (
    <ul className={`${DASH_CARD_CLASS} divide-y divide-neutral-200`}>
      {workspaces.map((workspace) => (
        <li key={workspace.id} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-sm font-semibold text-white">
              {workspace.name.trim().charAt(0).toUpperCase()}
            </span>
            <Link
              href={workspacePath(workspace.id)}
              className="truncate text-sm font-medium text-neutral-900 underline-offset-4 hover:underline"
            >
              {workspace.name}
            </Link>
          </div>
          <span className="flex shrink-0 items-center gap-3">
            {workspace.role === "owner" ? (
              <Link href={workspaceInvitesPath(workspace.id)} className={DASH_LINK_CLASS}>
                Invites
              </Link>
            ) : null}
            <Badge tone={workspace.role === "owner" ? "blue" : "gray"}>
              {MEMBER_ROLE_LABELS[workspace.role]}
            </Badge>
          </span>
        </li>
      ))}
    </ul>
  );
}
