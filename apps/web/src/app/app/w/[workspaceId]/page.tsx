import { notFound, redirect } from "next/navigation";

import { parseUuid } from "../../../../uuid";
import { workspacePath } from "../../../../workspace-paths";

interface WorkspaceHomeProps {
  params: Promise<{ workspaceId: string }>;
}

export default async function WorkspaceHome({ params }: WorkspaceHomeProps) {
  const workspaceId = parseUuid((await params).workspaceId);
  if (workspaceId === null) {
    notFound();
  }
  redirect(workspacePath(workspaceId));
}
