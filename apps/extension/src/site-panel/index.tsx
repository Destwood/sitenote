import { useCallback, useEffect, useState } from "react";

import { ERROR_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "../form-controls";
import { Icon } from "../icon";
import { PageThreadsPanel } from "../page-threads-panel";
import { TOGGLE_COMMENT_MODE_SHORTCUT } from "../manifest-config";
import { sendMessage, toggleCommentMode } from "../message-client";
import { SiteMenu } from "../site-menu";
import { WorkspacePicker } from "../workspace-picker";
import { createPendingEnable } from "../pending-enable";
import { ERROR_MESSAGES, type ErrorCode } from "@sitenote/widget";
import { getTargetTab, hasOriginAccess, requestOriginAccess, type TargetTab } from "../tab-access";
import type { SiteInfo, WorkspaceInfo } from "@sitenote/widget";
import { browser } from "wxt/browser";

export const LAST_WORKSPACE_KEY = "sitenote.lastWorkspace";
const PERMISSION_DENIED_MESSAGE = "Sitenote needs access to this site to show comments on it.";
const GUEST_HINT = "Guests can enable only sites that an owner or member has already added.";
const ENABLE_POLL_ATTEMPTS = 10;
const ENABLE_POLL_INTERVAL_MS = 300;
const pending = createPendingEnable(browser.storage.local);

type View =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "error"; code: ErrorCode }
  | { kind: "disabled"; tab: Target; workspaces: WorkspaceInfo[] }
  | { kind: "enabled"; tab: Target; site: SiteInfo; workspaces: WorkspaceInfo[] };

interface Target {
  id: number;
  origin: string;
}

interface SitePanelProps {
  webUrl: string;
  onManageSites: () => void;
  onWorkspaceName: (name: string | null) => void;
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

export function hostOf(origin: string): string {
  return URL.parse(origin)?.host ?? origin;
}

function monogramOf(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

function workspaceNameOf(view: View, workspaceId: string): string | null {
  if (view.kind === "enabled") {
    return view.site.workspaceName;
  }
  if (view.kind === "disabled") {
    return view.workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? null;
  }
  return null;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function loadView(tab: Target): Promise<View> {
  const site = await sendMessage({ type: "sites.forOrigin", origin: tab.origin });
  if (!site.ok) {
    return { kind: "error", code: site.error.code };
  }
  const workspaces = await sendMessage({ type: "workspaces.list" });
  if (site.data !== null) {
    return {
      kind: "enabled",
      tab,
      site: site.data,
      workspaces: workspaces.ok ? workspaces.data : [],
    };
  }
  return workspaces.ok
    ? { kind: "disabled", tab, workspaces: workspaces.data }
    : { kind: "error", code: workspaces.error.code };
}

async function resolveView(): Promise<View> {
  const target = asTarget(await getTargetTab(location.search));
  return target === null ? { kind: "unavailable" } : loadView(target);
}

export function SitePanel({ webUrl, onManageSites, onWorkspaceName }: SitePanelProps) {
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

  const workspaceName = workspaceNameOf(view, workspaceId);
  useEffect(() => {
    onWorkspaceName(workspaceName);
  }, [onWorkspaceName, workspaceName]);

  async function enableAfterPrompt(tab: Target) {
    await pending.set({ tabId: tab.id, origin: tab.origin, workspaceId });
    const granted = await requestOriginAccess(tab.origin);
    if (!granted) {
      await pending.clear();
      setFailed(PERMISSION_DENIED_MESSAGE);
      setBusy(false);
      return;
    }
    for (let attempt = 0; attempt < ENABLE_POLL_ATTEMPTS; attempt += 1) {
      await sleep(ENABLE_POLL_INTERVAL_MS);
      const site = await sendMessage({ type: "sites.forOrigin", origin: tab.origin });
      if (site.ok && site.data !== null) {
        saveLastWorkspace(workspaceId);
        await load();
        setBusy(false);
        return;
      }
    }
    await pending.clear();
    setFailed(ERROR_MESSAGES.unknown);
    setBusy(false);
  }

  async function enable(tab: Target) {
    if (busy || workspaceId === "") {
      return;
    }
    setBusy(true);
    setFailed(null);
    setNotice(null);
    if (!(await hasOriginAccess(tab.origin))) {
      await enableAfterPrompt(tab);
      return;
    }
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
      setFailed(ERROR_MESSAGES[result.error.code]);
      setBusy(false);
      return;
    }
    saveLastWorkspace(workspaceId);
    await load();
    setBusy(false);
  }

  async function disable(tab: Target): Promise<boolean> {
    if (busy) {
      return false;
    }
    setBusy(true);
    setFailed(null);
    setNotice(null);
    const result = await sendMessage({ type: "sites.disable", origin: tab.origin });
    if (!result.ok) {
      setFailed(ERROR_MESSAGES[result.error.code]);
      setBusy(false);
      return false;
    }
    await load();
    setBusy(false);
    return true;
  }

  async function switchWorkspace(
    tab: Target,
    currentWorkspaceId: string,
    workspaces: WorkspaceInfo[],
  ) {
    if (!(await disable(tab))) {
      return;
    }
    const other = workspaces.find((workspace) => workspace.id !== currentWorkspaceId);
    if (other !== undefined) {
      setWorkspaceId(other.id);
    }
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
      <p role="status" className="flex items-center gap-2 text-sm text-neutral-500">
        <span
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin rounded-full border-2 border-neutral-200 border-t-blue-600"
        />
        Checking this page...
      </p>
    );
  }
  if (view.kind === "unavailable") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-5 text-center">
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-full bg-neutral-200 text-neutral-600"
        >
          <Icon name="error" size={18} />
        </span>
        <p data-testid="site-unavailable" className="text-sm font-semibold text-neutral-900">
          Sitenote is not available on this page.
        </p>
        <p className="text-xs text-neutral-500">Chrome system pages can’t be annotated.</p>
      </div>
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
  const enabled = view.kind === "enabled";
  const host = hostOf(tab.origin);
  const selected =
    view.kind === "disabled"
      ? view.workspaces.find((workspace) => workspace.id === workspaceId)
      : undefined;

  return (
    <section aria-label="This site" className="flex flex-col gap-3">
      <div className="rounded-lg border border-neutral-200 bg-white">
        <div className="flex items-center gap-2.5 p-2.5">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-sm font-bold text-neutral-900 uppercase"
          >
            {host.charAt(0)}
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <p
              data-testid="site-origin"
              className="truncate text-sm font-semibold text-neutral-900"
            >
              {host}
            </p>
            <p
              data-testid="site-state"
              className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500"
            >
              <span
                aria-hidden="true"
                className={`size-1.5 shrink-0 rounded-full ${enabled ? "bg-green-500" : "bg-neutral-400"}`}
              />
              {enabled ? `Enabled in ${view.site.workspaceName}` : "Not enabled"}
            </p>
          </div>
          <SiteMenu
            webUrl={webUrl}
            captureErrors={enabled ? view.site.captureErrors : null}
            busy={busy}
            onToggleCapture={(on) => void changeErrorCapture(tab, on)}
            onDisable={() => void disable(tab)}
            onManageSites={onManageSites}
          />
        </div>
        {view.kind === "enabled" ? (
          <div className="flex items-center gap-2.5 rounded-b-lg border-t border-neutral-200 bg-neutral-50 px-2.5 py-2">
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-[11px] font-bold text-white"
            >
              {monogramOf(view.site.workspaceName)}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[11px] text-neutral-500">Workspace</span>
              <span className="truncate text-xs font-semibold text-neutral-900">
                {view.site.workspaceName}
              </span>
            </div>
            {view.workspaces.length > 1 ? (
              <button
                type="button"
                onClick={() => void switchWorkspace(tab, view.site.workspaceId, view.workspaces)}
                disabled={busy}
                className="rounded-md px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Switch
              </button>
            ) : null}
          </div>
        ) : view.workspaces.length > 1 ? (
          <WorkspacePicker
            value={workspaceId}
            options={view.workspaces}
            onChange={setWorkspaceId}
            disabled={busy}
          />
        ) : selected === undefined ? null : (
          <div className="flex items-center gap-2.5 rounded-b-lg border-t border-neutral-200 bg-neutral-50 px-2.5 py-2">
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-[11px] font-bold text-white"
            >
              {monogramOf(selected.name)}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[11px] text-neutral-500">Workspace</span>
              <span className="truncate text-xs font-semibold text-neutral-900">
                {selected.name}
              </span>
            </div>
          </div>
        )}
      </div>
      {enabled ? (
        <>
          <PageThreadsPanel tabId={tab.id} />
          <button
            type="button"
            onClick={() => void toggle(tab)}
            disabled={busy}
            aria-keyshortcuts={TOGGLE_COMMENT_MODE_SHORTCUT}
            className="flex h-11 w-full items-center justify-between rounded-lg bg-neutral-900 px-3 text-sm font-semibold text-white hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex items-center gap-2">
              <Icon name="comment" size={17} />
              Comment mode
            </span>
            <kbd className="rounded border border-neutral-600 bg-neutral-800 px-1.5 py-1 font-sans text-[10px] font-normal text-neutral-300">
              {TOGGLE_COMMENT_MODE_SHORTCUT}
            </kbd>
          </button>
        </>
      ) : view.workspaces.length === 0 ? (
        <p className="text-sm text-neutral-500">
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
          {selected?.role === "guest" ? (
            <div className="flex items-start gap-2.5 rounded-md bg-neutral-100 px-3 py-2.5 text-xs leading-relaxed text-neutral-600">
              <Icon name="users" size={15} className="mt-px shrink-0 text-neutral-900" />
              <p>{GUEST_HINT}</p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => void enable(tab)}
            disabled={busy}
            className={`${PRIMARY_BUTTON_CLASS} h-10 w-full text-sm`}
          >
            Enable on this site
          </button>
          <p className="text-center text-[11px] leading-snug text-neutral-500">
            {`Sitenote will be available whenever you visit ${host}.`}
          </p>
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
