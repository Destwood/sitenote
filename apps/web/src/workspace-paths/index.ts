export const WORKSPACE_SECTIONS = [
  "threads",
  "sites",
  "members",
  "invites",
  "integrations",
] as const;

export type WorkspaceSection = (typeof WORKSPACE_SECTIONS)[number];

export function workspacePath(workspaceId: string, section: WorkspaceSection = "threads"): string {
  return `/app/w/${workspaceId}/${section}`;
}

export function threadPath(workspaceId: string, threadId: string): string {
  return `${workspacePath(workspaceId, "threads")}/${threadId}`;
}

export function isWorkspaceSection(value: string | undefined): value is WorkspaceSection {
  return WORKSPACE_SECTIONS.some((section) => section === value);
}

export function workspaceSwitchPath(pathname: string, workspaceId: string): string {
  const section = pathname.split("/")[4];
  return workspacePath(workspaceId, isWorkspaceSection(section) ? section : "threads");
}
