"use client";

import { usePathname, useRouter } from "next/navigation";

import { INPUT_CLASS } from "../form-controls";
import { workspaceSwitchPath } from "../workspace-paths";

export interface WorkspaceSwitcherItem {
  id: string;
  name: string;
}

interface WorkspaceSwitcherProps {
  currentId: string;
  workspaces: readonly WorkspaceSwitcherItem[];
}

export function WorkspaceSwitcher({ currentId, workspaces }: WorkspaceSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-neutral-700">
      Workspace
      <select
        value={currentId}
        onChange={(event) => {
          router.push(workspaceSwitchPath(pathname, event.target.value));
        }}
        className={INPUT_CLASS}
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
    </label>
  );
}
