import { useCallback, useEffect, useState } from "react";

import {
  ERROR_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
  INPUT_CLASS,
} from "../form-controls";
import { sendMessage, toggleCommentMode } from "../message-client";
import { ERROR_MESSAGES, type ErrorCode } from "@sitenote/widget";
import {
  getTargetTab,
  hasOriginAccess,
  removeOriginAccess,
  requestOriginAccess,
  type TargetTab,
} from "../tab-access";
import type { SiteInfo, WorkspaceInfo } from "@sitenote/widget";

export const LAST_WORKSPACE_KEY = "sitenote.lastWorkspace";
const PERMISSION_DENIED_MESSAGE = "Sitenote needs access to this site to show comments on it.";
const GUEST_HINT = "Guests can enable only sites that an owner or member has already added.";

type View =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "error"; code: ErrorCode }
  | { kind: "disabled"; tab: Target; workspaces: WorkspaceInfo[] }
  | { kind: "enabled"; tab: Target; site: SiteInfo };

interface Target {
  id: number;
  origin: string;
}

interface SitePanelProps {
  webUrl: string;
}

function readLastWorkspace(): string | null {
  try {
    return localStorage.getItem(LAST_WORKSPACE_KEY);
  } catch {
    return null;
  }
}

function saveLastWorkspace(id: string): void {
  try {
    localStorage.setItem(LAST_WORKSPACE_KEY, id);
  } catch {
    return;
  }
}

function pickWorkspace(workspaces: readonly WorkspaceInfo[]): string {
  const last = readLastWorkspace();
  return workspaces.find((workspace) => workspace.id === last)?.id ?? workspaces[0]?.id ?? "";
}

function asTarget(tab: TargetTab | null): Target | null {
  return tab?.origin == null ? null : { id: tab.id, origin: tab.origin };
}

async function loadView(tab: Target): Promise<View> {
  const site = await sendMessage({ type: "sites.forOrigin", origin: tab.origin });
  if (!site.ok) {
    return { kind: "error", code: site.error.code };
  }
  if (site.data !== null) {
    return { kind: "enabled", tab, site: site.data };
  }
  const workspaces = await sendMessage({ type: "workspaces.list" });
  return workspaces.ok
    ? { kind: "disabled", tab, workspaces: workspaces.data }
    : { kind: "error", code: workspaces.error.code };
}

async function resolveView(): Promise<View> {
  const target = asTarget(await getTargetTab(location.search));
  return target === null ? { kind: "unavailable" } : loadView(target);
}

export function SitePanel({ webUrl }: SitePanelProps) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [workspaceId, setWorkspaceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const show = useCallback((next: View) => {
    if (next.kind === "disabled") {
      setWorkspaceId(pickWorkspace(next.workspaces));
    }
    setView(next);
  }, []);

  const load = useCallback(async () => {
    show(await resolveView());
  }, [show]);

  useEffect(() => {
    let active = true;
    void resolveView().then((next) => {
      if (active) {
        show(next);
      }
    });
    return () => {
      active = false;
    };
  }, [show]);

  async function enable(tab: Target) {
    if (busy || workspaceId === "") {
      return;
    }
    setBusy(true);
    setFailed(null);
    setNotice(null);
    const alreadyGranted = await hasOriginAccess(tab.origin);
    const granted = await requestOriginAccess(tab.origin);
    if (!granted) {
      setFailed(PERMISSION_DENIED_MESSAGE);
      setBusy(false);
      return;
    }
    const result = await sendMessage({
      type: "sites.enable",
      tabId: tab.id,
      origin: tab.origin,
      workspaceId,
    });
    if (!result.ok) {
      if (!alreadyGranted) {
        await removeOriginAccess(tab.origin);
      }
      setFailed(ERROR_MESSAGES[result.error.code]);
      setBusy(false);
      return;
    }
    saveLastWorkspace(workspaceId);
    await load();
    setBusy(false);
  }

  async function disable(tab: Target) {
    if (busy) {
      return;
    }
    setBusy(true);
    setFailed(null);
    setNotice(null);
    const result = await sendMessage({ type: "sites.disable", origin: tab.origin });
    if (!result.ok) {
      setFailed(ERROR_MESSAGES[result.error.code]);
      setBusy(false);
      return;
    }
    await load();
    setBusy(false);
  }

  async function changeErrorCapture(tab: Target, enabled: boolean) {
    if (busy) {
      return;
    }
    setBusy(true);
    setFailed(null);
    const result = await sendMessage({
      type: "sites.setErrorCapture",
      tabId: tab.id,
      origin: tab.origin,
      enabled,
    });
    if (!result.ok) {
      setFailed(ERROR_MESSAGES[result.error.code]);
      setBusy(false);
      return;
    }
    setNotice(
      enabled ? "Console errors will be captured." : "Console errors will not be captured.",
    );
    await load();
    setBusy(false);
  }

  async function toggle(tab: Target) {
    if (busy) {
      return;
    }
    setBusy(true);
    setFailed(null);
    const result = await toggleCommentMode(tab.id);
    setBusy(false);
    if (!result.ok) {
      setFailed(ERROR_MESSAGES[result.error.code]);
      return;
    }
    setNotice(result.data.active ? "Comment mode is on." : "Comment mode is off.");
  }

  if (view.kind === "loading") {
    return (
      <p role="status" className="text-sm text-neutral-600">
        Checking this page...
      </p>
    );
  }
  if (view.kind === "unavailable") {
    return (
      <p data-testid="site-unavailable" className="text-sm text-neutral-600">
        Sitenote is not available on this page.
      </p>
    );
  }
  if (view.kind === "error") {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className={ERROR_CLASS}>
          {ERROR_MESSAGES[view.code]}
        </p>
        <button type="button" onClick={() => void load()} className={SECONDARY_BUTTON_CLASS}>
          Try again
        </button>
      </div>
    );
  }

  const tab = view.tab;
  const selected =
    view.kind === "disabled"
      ? view.workspaces.find((workspace) => workspace.id === workspaceId)
      : undefined;

  return (
    <section
      aria-label="This site"
      className="flex flex-col gap-3 border-t border-neutral-200 pt-4"
    >
      <p data-testid="site-origin" className="truncate text-xs text-neutral-600">
        {tab.origin}
      </p>
      {view.kind === "enabled" ? (
        <>
          <p data-testid="site-state" className="text-sm font-semibold text-neutral-900">
            Enabled in {view.site.workspaceName}
          </p>
          <label className="flex items-center gap-2 text-sm text-neutral-900">
            <input
              type="checkbox"
              checked={view.site.captureErrors}
              onChange={(event) => void changeErrorCapture(tab, event.target.checked)}
              disabled={busy}
              className="size-4 accent-neutral-900"
            />
            Capture console errors
          </label>
          <button
            type="button"
            onClick={() => void toggle(tab)}
            disabled={busy}
            className={PRIMARY_BUTTON_CLASS}
          >
            Comment mode
          </button>
          <button
            type="button"
            onClick={() => void disable(tab)}
            disabled={busy}
            className={SECONDARY_BUTTON_CLASS}
          >
            Disable on this site
          </button>
        </>
      ) : (
        <>
          <p data-testid="site-state" className="text-sm font-semibold text-neutral-900">
            Not enabled
          </p>
          {view.workspaces.length === 0 ? (
            <p className="text-sm text-neutral-600">
              You are not in a workspace yet.{" "}
              <a
                href={`${webUrl}/app`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-neutral-900 underline underline-offset-4"
              >
                Create one on the web
              </a>
              .
            </p>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-sm font-medium text-neutral-900">
                Workspace
                <select
                  value={workspaceId}
                  onChange={(event) => {
                    setWorkspaceId(event.target.value);
                  }}
                  disabled={busy}
                  className={INPUT_CLASS}
                >
                  {view.workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
              </label>
              {selected?.role === "guest" ? (
                <p className="text-xs text-neutral-600">{GUEST_HINT}</p>
              ) : null}
              <button
                type="button"
                onClick={() => void enable(tab)}
                disabled={busy}
                className={PRIMARY_BUTTON_CLASS}
              >
                Enable on this site
              </button>
            </>
          )}
        </>
      )}
      {notice === null ? null : (
        <p role="status" className="text-sm text-neutral-700">
          {notice}
        </p>
      )}
      {failed === null ? null : (
        <p role="alert" className={ERROR_CLASS}>
          {failed}
        </p>
      )}
    </section>
  );
}
