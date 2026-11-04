"use client";

import type { Enums } from "@sitenote/db";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { DashIcon, type DashIconName } from "../dashboard-icons";
import { workspacePath, type WorkspaceSection } from "../workspace-paths";

interface NavItem {
  section: WorkspaceSection;
  label: string;
  icon: DashIconName;
  ownerOnly: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
  { section: "threads", label: "Threads", icon: "comment", ownerOnly: false },
  { section: "sites", label: "Sites", icon: "sites", ownerOnly: false },
  { section: "members", label: "Members", icon: "users", ownerOnly: false },
  { section: "invites", label: "Invites", icon: "invite", ownerOnly: true },
  { section: "integrations", label: "Integrations", icon: "integration", ownerOnly: true },
];

interface WorkspaceNavProps {
  workspaceId: string;
  role: Enums<"member_role">;
}

export function WorkspaceNav({ workspaceId, role }: WorkspaceNavProps) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => !item.ownerOnly || role === "owner");

  return (
    <nav
      aria-label="Workspace sections"
      className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible"
    >
      {items.map((item) => {
        const href = workspacePath(workspaceId, item.section);
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={item.section}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
              active
                ? "bg-neutral-100 text-neutral-900"
                : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
            }`}
          >
            <DashIcon
              name={item.icon}
              className={active ? "size-4 text-neutral-900" : "size-4 text-neutral-500"}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
