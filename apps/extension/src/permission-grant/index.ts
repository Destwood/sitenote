import type { PendingEnableStore } from "../pending-enable";
import type { SiteEnablement } from "../site-enablement";

const PATTERN_SUFFIX = "/*";

export interface PermissionGrantDeps {
  pending: Pick<PendingEnableStore, "take">;
  enablement: Pick<SiteEnablement, "enable">;
  removeAccess: (origin: string) => Promise<void>;
  now: () => number;
}

export interface GrantedPermissions {
  origins?: string[] | undefined;
}

export function originOfPattern(pattern: string): string | null {
  return pattern.endsWith(PATTERN_SUFFIX) ? pattern.slice(0, -PATTERN_SUFFIX.length) : null;
}

export function createPermissionGrantHandler(
  deps: PermissionGrantDeps,
): (granted: GrantedPermissions) => Promise<void> {
  async function finish(origin: string): Promise<void> {
    const entry = await deps.pending.take(origin, deps.now());
    if (entry === null) {
      return;
    }
    const result = await deps.enablement.enable({
      tabId: entry.tabId,
      origin,
      workspaceId: entry.workspaceId,
    });
    if (!result.ok) {
      await deps.removeAccess(origin);
    }
  }

  return async ({ origins }) => {
    for (const pattern of origins ?? []) {
      const origin = originOfPattern(pattern);
      if (origin !== null) {
        await finish(origin).catch(() => undefined);
      }
    }
  };
}
