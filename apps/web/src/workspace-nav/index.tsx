import type { Enums } from "@sitenote/db";
import Link from "next/link";

import { workspacePath, type WorkspaceSection } from "../workspace-paths";

interface NavItem {
  section: WorkspaceSection;
  label: string;
  ownerOnly: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { section: "threads", label: "Threads", ownerOnly: false },
  { section: "sites", label: "Sites", ownerOnly: false },
  { section: "members", label: "Members", ownerOnly: false },
  { section: "invites", label: "Invites", ownerOnly: true },
];

interface WorkspaceNavProps {
  workspaceId: string;
  role: Enums<"member_role">;
}

export function WorkspaceNav({ workspaceId, role }: WorkspaceNavProps) {
  const items = NAV_ITEMS.filter((item) => !item.ownerOnly || role === "owner");

  return (
    <nav aria-label="Workspace sections" className="flex flex-col gap-1">
      {items.map((item) => (
        <Link
          key={item.section}
          href={workspacePath(workspaceId, item.section)}
          className="rounded-md px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
