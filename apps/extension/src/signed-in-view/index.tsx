import { useEffect, useRef, useState } from "react";

import { AccountPanel, initialOf } from "../account-panel";
import { AllowedSitesPanel } from "../allowed-sites-panel";
import { Icon } from "../icon";
import { type AuthState } from "../messages";
import { NOTIFICATIONS_PREVIEW_SIZE, NotificationsPanel } from "../notifications-panel";
import { SitePanel, type WorkspaceControl } from "../site-panel";
import { WorkspacePicker, monogramOf } from "../workspace-picker";

type SignedInState = Extract<AuthState, { status: "signedIn" }>;
type Tray = "notifications" | "account";

interface SignedInViewProps {
  user: SignedInState["user"];
  webUrl: string;
  onSignedOut: (state: AuthState) => void;
}

interface PopupFooterProps {
  webUrl: string;
  workspaceControl: WorkspaceControl | null;
}

const ICON_BUTTON_CLASS =
  "relative flex size-7 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900";

const TRAY_CLASS =
  "absolute top-full right-3 z-30 mt-1 rounded-lg border border-neutral-200 bg-white p-1.5 shadow-xl";

export function SignedInView({ user, webUrl, onSignedOut }: SignedInViewProps) {
  const [screen, setScreen] = useState<"main" | "manage">("main");
  const [siteVersion, setSiteVersion] = useState(0);
  const [tray, setTray] = useState<Tray | null>(null);
  const [unread, setUnread] = useState(0);
  const [workspaceControl, setWorkspaceControl] = useState<WorkspaceControl | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (tray === null) {
      return;
    }
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!(event.target instanceof Node) || !headerRef.current?.contains(event.target)) {
        setTray(null);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setTray(null);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [tray]);

  function toggle(next: Tray) {
    setTray((current) => (current === next ? null : next));
  }

  return (
    <div className="flex flex-col">
      <header ref={headerRef} className="relative">
        <div className="flex h-14 items-center justify-between gap-2 border-b border-neutral-200 px-4">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="relative inline-block size-7 shrink-0 rounded-lg bg-neutral-900"
            >
              <span className="absolute top-[22%] left-1/4 size-[48%] rounded-[50%_50%_50%_12%] bg-white" />
              <span className="absolute top-[40%] left-[43%] size-[12%] rounded-full bg-blue-600" />
            </span>
            <span className="text-sm font-bold tracking-tight text-neutral-900">Sitenote</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Notifications"
              aria-expanded={tray === "notifications"}
              aria-controls="notifications-tray"
              onClick={() => {
                toggle("notifications");
              }}
              className={`${ICON_BUTTON_CLASS} ${tray === "notifications" ? "bg-neutral-100 text-neutral-900" : ""}`}
            >
              <Icon name="bell" size={16} />
              {unread > 0 ? (
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full border-2 border-white bg-blue-600 px-0.5 text-[9px] leading-none font-bold text-white">
                  {unread}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              aria-label="Account"
              data-testid="account-trigger"
              aria-expanded={tray === "account"}
              onClick={() => {
                toggle("account");
              }}
              className={`flex size-7 items-center justify-center rounded-full bg-stone-200 text-xs font-bold text-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 ${tray === "account" ? "ring-2 ring-neutral-900 ring-offset-1" : ""}`}
            >
              {initialOf(user.displayName)}
            </button>
          </div>
        </div>
        <div id="notifications-tray" hidden={tray !== "notifications"}>
          <div className={`${TRAY_CLASS} w-72`}>
            <h3 className="flex h-8 items-center px-2 text-sm font-semibold text-neutral-900">
              Notifications
            </h3>
            <NotificationsPanel
              onUnreadChange={setUnread}
              limit={NOTIFICATIONS_PREVIEW_SIZE}
              webUrl={webUrl}
            />
          </div>
        </div>
        {tray === "account" ? (
          <div className={`${TRAY_CLASS} w-56`}>
            <AccountPanel user={user} onSignedOut={onSignedOut} />
          </div>
        ) : null}
      </header>
      {screen === "manage" ? (
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              aria-label="Back"
              onClick={() => {
                setScreen("main");
              }}
              className="flex size-7 shrink-0 items-center justify-center rounded-md border border-neutral-200 text-neutral-700 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
            >
              <Icon name="chevron" size={14} className="rotate-180" />
            </button>
            <div className="flex flex-col">
              <h2 className="text-sm font-semibold text-neutral-900">Allowed sites</h2>
              <p className="text-xs text-neutral-500">Sitenote can run on these origins.</p>
            </div>
          </div>
          <AllowedSitesPanel
            onChanged={() => {
              setSiteVersion((version) => version + 1);
            }}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          <SitePanel
            key={siteVersion}
            webUrl={webUrl}
            onManageSites={() => {
              setScreen("manage");
            }}
            onWorkspaceControl={setWorkspaceControl}
          />
        </div>
      )}
      <PopupFooter webUrl={webUrl} workspaceControl={workspaceControl} />
    </div>
  );
}

function PopupFooter({ webUrl, workspaceControl }: PopupFooterProps) {
  const dashboardUrl =
    workspaceControl === null || workspaceControl.value === ""
      ? `${webUrl}/app/dashboard`
      : `${webUrl}/app/w/${workspaceControl.value}`;
  return (
    <footer className="flex h-10 items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-4">
      <a
        href={dashboardUrl}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 rounded-sm text-xs font-semibold text-neutral-500 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900"
      >
        <Icon name="table" size={13} />
        Open dashboard
      </a>
      {workspaceControl === null ? null : workspaceControl.options.length > 1 ? (
        <WorkspacePicker
          value={workspaceControl.value}
          options={workspaceControl.options}
          onChange={workspaceControl.onChange}
          disabled={workspaceControl.disabled}
        />
      ) : (
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className="flex size-5 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-[10px] font-bold text-white"
          >
            {monogramOf(workspaceControl.options[0]?.name ?? "")}
          </span>
          <span className="max-w-[8.5rem] truncate text-[11px] font-semibold text-neutral-700">
            {workspaceControl.options[0]?.name}
          </span>
        </span>
      )}
    </footer>
  );
}
