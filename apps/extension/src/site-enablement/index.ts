import { failure, success, type MessageResult } from "../messages";
import type { DataService } from "../data-service";
import type { EnablementStore } from "../enablement-store";

export const CONTENT_SCRIPT_FILE = "/content-scripts/content.js";
const SCRIPT_ID_PREFIX = "sitenote:";

export interface RegisteredScript {
  id: string;
}

export interface ScriptingApi {
  getRegisteredContentScripts: (filter: { ids: string[] }) => Promise<RegisteredScript[]>;
  registerContentScripts: (
    scripts: {
      id: string;
      matches: string[];
      js: string[];
      runAt: "document_idle";
      persistAcrossSessions: boolean;
    }[],
  ) => Promise<void>;
  unregisterContentScripts: (filter: { ids: string[] }) => Promise<void>;
  executeScript: (injection: {
    target: { tabId: number };
    files: (typeof CONTENT_SCRIPT_FILE)[];
  }) => Promise<unknown>;
}

export interface PermissionsApi {
  contains: (permissions: { origins: string[] }) => Promise<boolean>;
  remove: (permissions: { origins: string[] }) => Promise<boolean>;
}

export interface SiteEnablementDeps {
  store: EnablementStore;
  data: Pick<DataService, "ensureSite">;
  scripting: ScriptingApi;
  permissions: PermissionsApi;
  onDisabled: (origin: string) => void;
}

export interface EnableRequest {
  tabId: number;
  origin: string;
  workspaceId: string;
}

export interface SiteEnablement {
  enable: (request: EnableRequest) => Promise<MessageResult<null>>;
  disable: (origin: string) => Promise<MessageResult<null>>;
  reconcile: () => Promise<void>;
}

export function originPattern(origin: string): string {
  return `${origin}/*`;
}

export function scriptIdFor(origin: string): string {
  return `${SCRIPT_ID_PREFIX}${origin}`;
}

export function createSiteEnablement(deps: SiteEnablementDeps): SiteEnablement {
  const { store, scripting, permissions } = deps;

  async function unregister(origin: string): Promise<void> {
    const ids = [scriptIdFor(origin)];
    const present = await scripting.getRegisteredContentScripts({ ids });
    if (present.length > 0) {
      await scripting.unregisterContentScripts({ ids });
    }
  }

  async function register(origin: string): Promise<void> {
    await unregister(origin);
    await scripting.registerContentScripts([
      {
        id: scriptIdFor(origin),
        matches: [originPattern(origin)],
        js: [CONTENT_SCRIPT_FILE],
        runAt: "document_idle",
        persistAcrossSessions: true,
      },
    ]);
  }

  async function teardown(origin: string, removePermission: boolean): Promise<void> {
    await store.remove(origin);
    try {
      await unregister(origin);
    } finally {
      if (removePermission) {
        await permissions.remove({ origins: [originPattern(origin)] }).catch(() => false);
      }
      deps.onDisabled(origin);
    }
  }

  return {
    async enable({ tabId, origin, workspaceId }) {
      try {
        if (!(await permissions.contains({ origins: [originPattern(origin)] }))) {
          return failure("forbidden");
        }
        const site = await deps.data.ensureSite(workspaceId, origin);
        if (!site.ok) {
          return site;
        }
        await register(origin);
        await store.set(origin, { siteId: site.data, workspaceId });
        try {
          await scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT_FILE] });
        } catch {
          await store.remove(origin);
          await unregister(origin).catch(() => undefined);
          return failure("page_unavailable");
        }
        return success(null);
      } catch {
        return failure("unknown");
      }
    },

    async disable(origin) {
      try {
        await teardown(origin, true);
        return success(null);
      } catch {
        return failure("unknown");
      }
    },

    async reconcile() {
      for (const origin of Object.keys(await store.list())) {
        if (!(await permissions.contains({ origins: [originPattern(origin)] }))) {
          await teardown(origin, false).catch(() => undefined);
        }
      }
    },
  };
}
