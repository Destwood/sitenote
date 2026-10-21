import { describe, expect, it, vi } from "vitest";

import type { EnabledEntry } from "../enablement-store";
import { failure, success } from "../messages";
import {
  CONTENT_SCRIPT_FILE,
  type PermissionsApi,
  createSiteEnablement,
  originPattern,
  scriptIdFor,
  type ScriptingApi,
} from ".";

const ORIGIN = "https://example.test";
const OTHER = "http://127.0.0.1:4173";
const SITE_ID = "20000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const REQUEST = { tabId: 7, origin: ORIGIN, workspaceId: WORKSPACE_ID };

function setup(
  options: {
    granted?: boolean;
    registered?: string[];
    ensure?: ReturnType<typeof failure> | ReturnType<typeof success<string>>;
    execute?: () => Promise<unknown>;
    initial?: Record<string, EnabledEntry>;
    removeResult?: () => Promise<boolean>;
  } = {},
) {
  const log: string[] = [];
  const entries = new Map<string, EnabledEntry>(Object.entries(options.initial ?? {}));
  const registered = new Set(options.registered ?? []);
  const store = {
    get: vi.fn((origin: string) => Promise.resolve(entries.get(origin) ?? null)),
    list: vi.fn(() => Promise.resolve(Object.fromEntries(entries))),
    set: vi.fn((origin: string, entry: EnabledEntry) => {
      log.push(`store.set ${origin}`);
      entries.set(origin, entry);
      return Promise.resolve();
    }),
    remove: vi.fn((origin: string) => {
      log.push(`store.remove ${origin}`);
      entries.delete(origin);
      return Promise.resolve();
    }),
  };
  const scripting: ScriptingApi = {
    getRegisteredContentScripts: vi.fn<ScriptingApi["getRegisteredContentScripts"]>(({ ids }) =>
      Promise.resolve(ids.filter((id) => registered.has(id)).map((id) => ({ id }))),
    ),
    registerContentScripts: vi.fn<ScriptingApi["registerContentScripts"]>((scripts) => {
      for (const script of scripts) {
        log.push(`register ${script.id}`);
        registered.add(script.id);
      }
      return Promise.resolve();
    }),
    unregisterContentScripts: vi.fn<ScriptingApi["unregisterContentScripts"]>(({ ids }) => {
      for (const id of ids) {
        log.push(`unregister ${id}`);
        registered.delete(id);
      }
      return Promise.resolve();
    }),
    executeScript: vi.fn<ScriptingApi["executeScript"]>(() => {
      log.push("execute");
      return options.execute?.() ?? Promise.resolve([]);
    }),
  };
  const permissions = {
    contains: vi.fn<PermissionsApi["contains"]>(() => Promise.resolve(options.granted ?? true)),
    remove: vi.fn<PermissionsApi["remove"]>(
      () => options.removeResult?.() ?? Promise.resolve(true),
    ),
  };
  const data = {
    ensureSite: vi.fn(() => {
      log.push("ensureSite");
      return Promise.resolve(options.ensure ?? success(SITE_ID));
    }),
  };
  const onDisabled = vi.fn();
  const service = createSiteEnablement({ store, data, scripting, permissions, onDisabled });
  return { service, store, scripting, permissions, data, onDisabled, log, entries, registered };
}

describe("helpers", () => {
  it("builds the match pattern and the script id of an origin", () => {
    expect(originPattern(OTHER)).toBe("http://127.0.0.1:4173/*");
    expect(scriptIdFor(OTHER)).toBe("sitenote:http://127.0.0.1:4173");
  });
});

describe("enable", () => {
  it("registers the site, the script and the entry, then injects into the tab, in that order", async () => {
    const { service, log, scripting, entries } = setup();

    expect(await service.enable(REQUEST)).toEqual(success(null));

    expect(log).toEqual([
      "ensureSite",
      `register ${scriptIdFor(ORIGIN)}`,
      `store.set ${ORIGIN}`,
      "execute",
    ]);
    expect(entries.get(ORIGIN)).toEqual({ siteId: SITE_ID, workspaceId: WORKSPACE_ID });
    expect(scripting.registerContentScripts).toHaveBeenCalledWith([
      {
        id: scriptIdFor(ORIGIN),
        matches: ["https://example.test/*"],
        js: [CONTENT_SCRIPT_FILE],
        runAt: "document_idle",
        persistAcrossSessions: true,
      },
    ]);
    expect(scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      files: [CONTENT_SCRIPT_FILE],
    });
  });

  it("asks the data layer for the site of the chosen workspace", async () => {
    const { service, data } = setup();

    await service.enable(REQUEST);

    expect(data.ensureSite).toHaveBeenCalledWith(WORKSPACE_ID, ORIGIN);
  });

  it("is forbidden without the host permission and does nothing else", async () => {
    const { service, log, data } = setup({ granted: false });

    expect(await service.enable(REQUEST)).toEqual(failure("forbidden"));
    expect(log).toEqual([]);
    expect(data.ensureSite).not.toHaveBeenCalled();
  });

  it("returns the data error and registers nothing when the site cannot be registered", async () => {
    const { service, log } = setup({ ensure: failure("forbidden") });

    expect(await service.enable(REQUEST)).toEqual(failure("forbidden"));
    expect(log).toEqual(["ensureSite"]);
  });

  it("replaces a script that is already registered for the origin", async () => {
    const { service, log } = setup({ registered: [scriptIdFor(ORIGIN)] });

    await service.enable(REQUEST);

    expect(log.slice(0, 3)).toEqual([
      "ensureSite",
      `unregister ${scriptIdFor(ORIGIN)}`,
      `register ${scriptIdFor(ORIGIN)}`,
    ]);
  });

  it("undoes the entry and the registration when the page cannot be scripted", async () => {
    const { service, entries, registered } = setup({
      execute: () => Promise.reject(new Error("Cannot access contents of the page")),
    });

    expect(await service.enable(REQUEST)).toEqual(failure("page_unavailable"));

    expect(entries.size).toBe(0);
    expect(registered.size).toBe(0);
  });

  it("reports an unknown error when registering fails", async () => {
    const { service, scripting, entries } = setup();
    vi.mocked(scripting.registerContentScripts).mockRejectedValueOnce(new Error("bad pattern"));

    expect(await service.enable(REQUEST)).toEqual(failure("unknown"));
    expect(entries.size).toBe(0);
  });
});

describe("disable", () => {
  const ENTRY: EnabledEntry = { siteId: SITE_ID, workspaceId: WORKSPACE_ID };

  it("drops the entry first, then unregisters, removes the permission and tells the tabs", async () => {
    const { service, log, permissions, onDisabled } = setup({
      initial: { [ORIGIN]: ENTRY },
      registered: [scriptIdFor(ORIGIN)],
    });

    expect(await service.disable(ORIGIN)).toEqual(success(null));

    expect(log).toEqual([`store.remove ${ORIGIN}`, `unregister ${scriptIdFor(ORIGIN)}`]);
    expect(permissions.remove).toHaveBeenCalledWith({ origins: ["https://example.test/*"] });
    expect(onDisabled).toHaveBeenCalledWith(ORIGIN);
  });

  it("works when nothing was registered", async () => {
    const { service, scripting, onDisabled } = setup();

    expect(await service.disable(ORIGIN)).toEqual(success(null));
    expect(scripting.unregisterContentScripts).not.toHaveBeenCalled();
    expect(onDisabled).toHaveBeenCalledWith(ORIGIN);
  });

  it("succeeds even when the permission cannot be removed", async () => {
    const { service } = setup({
      removeResult: () => Promise.reject(new Error("required permission")),
    });

    expect(await service.disable(ORIGIN)).toEqual(success(null));
  });

  it("still removes the permission and notifies when unregistering fails, and reports the failure", async () => {
    const { service, scripting, permissions, onDisabled, entries } = setup({
      initial: { [ORIGIN]: ENTRY },
      registered: [scriptIdFor(ORIGIN)],
    });
    vi.mocked(scripting.unregisterContentScripts).mockRejectedValueOnce(new Error("boom"));

    expect(await service.disable(ORIGIN)).toEqual(failure("unknown"));

    expect(entries.size).toBe(0);
    expect(permissions.remove).toHaveBeenCalledTimes(1);
    expect(onDisabled).toHaveBeenCalledWith(ORIGIN);
  });
});

describe("reconcile", () => {
  const ENTRY: EnabledEntry = { siteId: SITE_ID, workspaceId: WORKSPACE_ID };

  it("cleans up origins whose permission was removed and keeps the others", async () => {
    const { service, permissions, entries, registered, onDisabled } = setup({
      initial: { [ORIGIN]: ENTRY, [OTHER]: ENTRY },
      registered: [scriptIdFor(ORIGIN), scriptIdFor(OTHER)],
    });
    permissions.contains.mockImplementation((query: { origins: string[] }) =>
      Promise.resolve(query.origins[0] === originPattern(OTHER)),
    );

    await service.reconcile();

    expect([...entries.keys()]).toEqual([OTHER]);
    expect([...registered]).toEqual([scriptIdFor(OTHER)]);
    expect(permissions.remove).not.toHaveBeenCalled();
    expect(onDisabled).toHaveBeenCalledExactlyOnceWith(ORIGIN);
  });

  it("does nothing when every permission is still there", async () => {
    const { service, entries, onDisabled } = setup({ initial: { [ORIGIN]: ENTRY } });

    await service.reconcile();

    expect(entries.size).toBe(1);
    expect(onDisabled).not.toHaveBeenCalled();
  });

  it("keeps going when one cleanup fails", async () => {
    const { service, scripting, permissions, entries } = setup({
      initial: { [ORIGIN]: ENTRY, [OTHER]: ENTRY },
      registered: [scriptIdFor(ORIGIN), scriptIdFor(OTHER)],
    });
    permissions.contains.mockResolvedValue(false);
    vi.mocked(scripting.unregisterContentScripts).mockRejectedValueOnce(new Error("boom"));

    await service.reconcile();

    expect(entries.size).toBe(0);
  });
});
