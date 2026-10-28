import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

import { AccountPanel } from "../account-panel";
import { AllowedSitesPanel } from "../allowed-sites-panel";
import { ERROR_CLASS, SECONDARY_BUTTON_CLASS } from "../form-controls";
import { onAuthStateChanged, sendMessage } from "../message-client";
import { type AuthState } from "../messages";
import { ERROR_MESSAGES, type ErrorCode } from "@sitenote/widget";
import { NotificationsPanel } from "../notifications-panel";
import { PageThreadsPanel } from "../page-threads-panel";
import { SignInPanel } from "../sign-in-panel";
import { SelectionPlacementControl } from "../selection-placement-control";
import { SitePanel } from "../site-panel";

type TabId = "comments" | "notifications";

const TAB_ORDER: readonly TabId[] = ["comments", "notifications"];
const TAB_CLASS =
  "-mb-px flex-1 border-b-2 px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900";

type View =
  { kind: "loading" } | { kind: "error"; code: ErrorCode } | { kind: "ready"; state: AuthState };

interface PopupAppProps {
  googleEnabled: boolean;
  webUrl: string;
}

async function fetchView(): Promise<View> {
  const result = await sendMessage({ type: "auth.getState" });
  return result.ok
    ? { kind: "ready", state: result.data }
    : { kind: "error", code: result.error.code };
}

export function notificationsTabLabel(unread: number): string {
  return unread > 0 ? `Notifications (${String(unread)})` : "Notifications";
}

export function commentsTabLabel(openCount: number | null): string {
  return openCount === null ? "Comments" : `Comments (${String(openCount)})`;
}

interface SignedInTabsProps {
  webUrl: string;
}

function SignedInTabs({ webUrl }: SignedInTabsProps) {
  const [tab, setTab] = useState<TabId>("comments");
  const [unread, setUnread] = useState(0);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [pageTabId, setPageTabId] = useState<number | null>(null);
  const [listVersion, setListVersion] = useState(0);
  const [siteVersion, setSiteVersion] = useState(0);
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    comments: null,
    notifications: null,
  });

  const handleSiteState = useCallback((enabled: boolean, tabId: number | null) => {
    setPageTabId(enabled ? tabId : null);
    if (!enabled) {
      setOpenCount(null);
    }
  }, []);

  function show(next: TabId) {
    setTab(next);
    if (next === "comments") {
      setListVersion((version) => version + 1);
    }
  }

  function select(next: TabId) {
    show(next);
    tabRefs.current[next]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TAB_ORDER.indexOf(tab);
    const target: TabId | undefined =
      event.key === "ArrowRight"
        ? TAB_ORDER[(index + 1) % TAB_ORDER.length]
        : event.key === "ArrowLeft"
          ? TAB_ORDER[(index - 1 + TAB_ORDER.length) % TAB_ORDER.length]
          : event.key === "Home"
            ? TAB_ORDER[0]
            : event.key === "End"
              ? TAB_ORDER[TAB_ORDER.length - 1]
              : undefined;
    if (target !== undefined) {
      event.preventDefault();
      select(target);
    }
  }

  function tabClass(id: TabId): string {
    return `${TAB_CLASS} ${tab === id ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-600 hover:text-neutral-900"}`;
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="Sitenote"
        onKeyDown={handleKeyDown}
        className="flex border-b border-neutral-200"
      >
        <button
          ref={(element) => {
            tabRefs.current.comments = element;
          }}
          type="button"
          role="tab"
          id="popup-tab-comments"
          aria-selected={tab === "comments"}
          aria-controls="popup-panel-comments"
          tabIndex={tab === "comments" ? 0 : -1}
          onClick={() => {
            show("comments");
          }}
          className={tabClass("comments")}
        >
          {commentsTabLabel(openCount)}
        </button>
        <button
          ref={(element) => {
            tabRefs.current.notifications = element;
          }}
          type="button"
          role="tab"
          id="popup-tab-notifications"
          aria-selected={tab === "notifications"}
          aria-controls="popup-panel-notifications"
          tabIndex={tab === "notifications" ? 0 : -1}
          onClick={() => {
            setTab("notifications");
          }}
          className={tabClass("notifications")}
        >
          {notificationsTabLabel(unread)}
        </button>
      </div>
      <div
        role="tabpanel"
        id="popup-panel-comments"
        aria-labelledby="popup-tab-comments"
        hidden={tab !== "comments"}
      >
        <SitePanel key={siteVersion} webUrl={webUrl} onStateChange={handleSiteState} />
        {pageTabId === null ? null : (
          <PageThreadsPanel key={listVersion} tabId={pageTabId} onCount={setOpenCount} />
        )}
        <AllowedSitesPanel
          onChanged={() => {
            setSiteVersion((version) => version + 1);
          }}
        />
      </div>
      <div
        role="tabpanel"
        id="popup-panel-notifications"
        aria-labelledby="popup-tab-notifications"
        hidden={tab !== "notifications"}
      >
        <NotificationsPanel onUnreadChange={setUnread} />
      </div>
    </div>
  );
}

export function PopupApp({ googleEnabled, webUrl }: PopupAppProps) {
  const [view, setView] = useState<View>({ kind: "loading" });

  const showState = useCallback((state: AuthState) => {
    setView({ kind: "ready", state });
  }, []);

  const retry = useCallback(() => {
    setView({ kind: "loading" });
    void fetchView().then(setView);
  }, []);

  useEffect(() => {
    let active = true;
    void fetchView().then((next) => {
      if (active) {
        setView(next);
      }
    });
    const unsubscribe = onAuthStateChanged(showState);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [showState]);

  return (
    <main className="flex w-[340px] flex-col gap-4 bg-white p-4 text-neutral-900">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-base font-bold tracking-tight">Sitenote</h1>
        {view.kind === "ready" && view.state.status === "signedIn" ? (
          <SelectionPlacementControl />
        ) : null}
      </div>
      {view.kind === "loading" ? (
        <p role="status" className="text-sm text-neutral-600">
          Loading...
        </p>
      ) : null}
      {view.kind === "error" ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className={ERROR_CLASS}>
            {ERROR_MESSAGES[view.code]}
          </p>
          <button type="button" onClick={retry} className={SECONDARY_BUTTON_CLASS}>
            Try again
          </button>
        </div>
      ) : null}
      {view.kind === "ready" && view.state.status === "signedOut" ? (
        <SignInPanel googleEnabled={googleEnabled} webUrl={webUrl} onSignedIn={showState} />
      ) : null}
      {view.kind === "ready" && view.state.status === "signedIn" ? (
        <>
          <AccountPanel user={view.state.user} webUrl={webUrl} onSignedOut={showState} />
          <SignedInTabs webUrl={webUrl} />
        </>
      ) : null}
    </main>
  );
}
