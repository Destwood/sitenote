import { failure, success, type MessageResult } from "@sitenote/widget";
import type { DataService } from "../data-service";
import type { EnablementStore } from "../enablement-store";

export const CONTENT_SCRIPT_FILE = "/content-scripts/content.js";
export const ERRORS_SCRIPT_FILE = "/console-errors.js";
const SCRIPT_ID_PREFIX = "sitenote:";
const ERRORS_SCRIPT_ID_PREFIX = "sitenote:errors:";

export type ScriptFile = typeof CONTENT_SCRIPT_FILE | typeof ERRORS_SCRIPT_FILE;

export interface ScriptRegistration {
  id: string;
  matches: string[];
  js: ScriptFile[];
  runAt: "document_idle" | "document_start";
  persistAcrossSessions: boolean;
  world?: "MAIN";
}

export interface RegisteredScript {
  id: string;
}

export interface ScriptingApi {
  getRegisteredContentScripts: (filter: { ids: string[] }) => Promise<RegisteredScript[]>;
  registerContentScripts: (scripts: ScriptRegistration[]) => Promise<void>;
  unregisterContentScripts: (filter: { ids: string[] }) => Promise<void>;
  executeScript: (injection: {
    target: { tabId: number };
    files: ScriptFile[];
    world?: "MAIN";
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

export interface ErrorCaptureRequest {
  tabId: number;
  origin: string;
  enabled: boolean;
}

export interface SiteEnablement {
  enable: (request: EnableRequest) => Promise<MessageResult<null>>;
  disable: (origin: string) => Promise<MessageResult<null>>;
  setErrorCapture: (request: ErrorCaptureRequest) => Promise<MessageResult<null>>;
  reconcile: () => Promise<void>;
}

export function originPattern(origin: string): string {
  return `${origin}/*`;
}

export function scriptIdFor(origin: string): string {
  return `${SCRIPT_ID_PREFIX}${origin}`;
}

export function errorsScriptIdFor(origin: string): string {
  return `${ERRORS_SCRIPT_ID_PREFIX}${origin}`;
}

export function createSiteEnablement(deps: SiteEnablementDeps): SiteEnablement {
  const { store, scripting, permissions } = deps;

  async function unregister(origin: string): Promise<void> {
    const ids = [scriptIdFor(origin), errorsScriptIdFor(origin)];
    const present = await scripting.getRegisteredContentScripts({ ids });
    if (present.length > 0) {
      await scripting.unregisterContentScripts({ ids: present.map((script) => script.id) });
    }
  }

  async function register(origin: string, captureErrors: boolean): Promise<void> {
    await unregister(origin);
    const scripts: ScriptRegistration[] = [
      {
        id: scriptIdFor(origin),
        matches: [originPattern(origin)],
        js: [CONTENT_SCRIPT_FILE],
        runAt: "document_idle",
        persistAcrossSessions: true,
      },
    ];
    if (captureErrors) {
      scripts.push({
        id: errorsScriptIdFor(origin),
        matches: [originPattern(origin)],
        js: [ERRORS_SCRIPT_FILE],
        runAt: "document_start",
        persistAcrossSessions: true,
        world: "MAIN",
      });
    }
    await scripting.registerContentScripts(scripts);
  }

  async function injectErrorCapture(tabId: number): Promise<void> {
    await scripting
      .executeScript({ target: { tabId }, files: [ERRORS_SCRIPT_FILE], world: "MAIN" })
      .catch(() => undefined);
  }

  async function ensureRegistered(origin: string, captureErrors: boolean): Promise<void> {
    const ids = [scriptIdFor(origin), errorsScriptIdFor(origin)];
    const present = new Set(
      (await scripting.getRegisteredContentScripts({ ids })).map((script) => script.id),
    );
    const complete =
      present.has(scriptIdFor(origin)) && present.has(errorsScriptIdFor(origin)) === captureErrors;
    if (!complete) {
      await register(origin, captureErrors);
    }
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
        const captureErrors = (await store.get(origin))?.captureErrors ?? true;
        await register(origin, captureErrors);
        await store.set(origin, { siteId: site.data, workspaceId, captureErrors });
        try {
          if (captureErrors) {
            await injectErrorCapture(tabId);
          }
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

    async setErrorCapture({ tabId, origin, enabled }) {
      try {
        const entry = await store.get(origin);
        if (entry === null) {
          return failure("not_found");
        }
        await store.set(origin, { ...entry, captureErrors: enabled });
        await register(origin, enabled);
        if (enabled) {
          await injectErrorCapture(tabId);
        }
        return success(null);
      } catch {
        return failure("unknown");
      }
    },

    async reconcile() {
      for (const [origin, entry] of Object.entries(await store.list())) {
        if (await permissions.contains({ origins: [originPattern(origin)] })) {
          await ensureRegistered(origin, entry.captureErrors).catch(() => undefined);
        } else {
          await teardown(origin, false).catch(() => undefined);
        }
      }
    },
  };
}
