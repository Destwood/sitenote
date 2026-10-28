import { formatRelativeTime } from "@sitenote/ui";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ERROR_CLASS,
  LINK_BUTTON_CLASS,
  MENU_ITEM_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../form-controls";
import { onNotificationsChanged, sendMessage } from "../message-client";
import { ERROR_MESSAGES, type ErrorCode } from "@sitenote/widget";
import { openThread } from "../open-thread";
import type { NotificationRecord } from "@sitenote/widget";

export const NOTIFICATIONS_PAGE_SIZE = 30;
export const NOTIFICATIONS_PREVIEW_SIZE = 5;
export const OPEN_FAILED_MESSAGE = "That page could not be opened.";
export const EMPTY_NOTIFICATIONS_MESSAGE = "No notifications yet.";

type View =
  | { kind: "loading" }
  | { kind: "error"; code: ErrorCode }
  | { kind: "ready"; items: NotificationRecord[]; unread: number };

interface NotificationsPanelProps {
  onUnreadChange: (unread: number) => void;
  limit?: number;
  webUrl?: string;
}

function fetchList() {
  return sendMessage({ type: "notifications.list", limit: NOTIFICATIONS_PAGE_SIZE });
}

export function describeNotification(item: NotificationRecord): string {
  return item.kind === "mention"
    ? `${item.actorName} mentioned you`
    : `${item.actorName} replied in a thread`;
}

export function describePage(pageUrl: string): string {
  const url = URL.parse(pageUrl);
  if (url === null) {
    return pageUrl;
  }
  const path = url.pathname === "/" ? "" : url.pathname;
  return `${url.host}${path}`;
}

export function notificationsLabel(unread: number): string {
  return unread > 0 ? `Notifications (${String(unread)})` : "Notifications";
}

export function NotificationsPanel({ onUnreadChange, limit, webUrl }: NotificationsPanelProps) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const latest = useRef(0);

  const apply = useCallback(
    (result: Awaited<ReturnType<typeof fetchList>>) => {
      if (result.ok) {
        setNow(Date.now());
        setView({ kind: "ready", ...result.data });
        onUnreadChange(result.data.unread);
      } else {
        setView({ kind: "error", code: result.error.code });
      }
    },
    [onUnreadChange],
  );

  const load = useCallback(async () => {
    latest.current += 1;
    const ticket = latest.current;
    const result = await fetchList();
    if (ticket === latest.current) {
      apply(result);
    }
  }, [apply]);

  useEffect(() => {
    let active = true;
    function refresh() {
      latest.current += 1;
      const ticket = latest.current;
      void fetchList().then((result) => {
        if (active && ticket === latest.current) {
          apply(result);
        }
      });
    }
    refresh();
    const stop = onNotificationsChanged(refresh);
    return () => {
      active = false;
      stop();
    };
  }, [apply]);

  async function open(item: NotificationRecord) {
    setFailed(null);
    if (!item.read) {
      await sendMessage({ type: "notifications.markRead", ids: [item.id] });
    }
    if (!(await openThread(item))) {
      setFailed(OPEN_FAILED_MESSAGE);
    }
    await load();
  }

  async function markAllRead() {
    if (busy) {
      return;
    }
    setBusy(true);
    setFailed(null);
    const result = await sendMessage({ type: "notifications.markAllRead" });
    if (result.ok) {
      await load();
    } else {
      setFailed(ERROR_MESSAGES[result.error.code]);
    }
    setBusy(false);
  }

  if (view.kind === "loading") {
    return (
      <p role="status" className="text-sm text-neutral-600">
        Loading notifications...
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

  return (
    <section aria-label="Notifications" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p data-testid="notifications-summary" className="text-xs text-neutral-600">
          {view.unread === 0 ? "You are all caught up." : `${String(view.unread)} unread`}
        </p>
        <button
          type="button"
          onClick={() => void markAllRead()}
          disabled={busy || view.unread === 0}
          className={LINK_BUTTON_CLASS}
        >
          Mark all as read
        </button>
      </div>
      {failed === null ? null : (
        <p role="alert" className={ERROR_CLASS}>
          {failed}
        </p>
      )}
      {view.items.length === 0 ? (
        <p className="text-sm text-neutral-600">{EMPTY_NOTIFICATIONS_MESSAGE}</p>
      ) : (
        <ul
          className={
            limit === undefined ? "-mx-1 flex max-h-80 flex-col overflow-y-auto" : "flex flex-col"
          }
        >
          {view.items.slice(0, limit).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                data-testid="notification-item"
                data-unread={item.read ? "false" : "true"}
                onClick={() => void open(item)}
                className={`flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 ${item.read ? "text-neutral-700" : "bg-blue-50 text-neutral-900"}`}
              >
                <span className="flex items-start gap-2 text-sm">
                  {item.read ? null : (
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-700"
                    />
                  )}
                  <span className={item.read ? "font-medium" : "font-semibold"}>
                    {item.read ? null : <span className="sr-only">Unread. </span>}
                    {describeNotification(item)}
                    {item.threadStatus === "resolved" ? " (resolved)" : ""}
                  </span>
                </span>
                {item.excerpt === "" ? null : (
                  <span className="line-clamp-2 text-sm break-words">{item.excerpt}</span>
                )}
                <span className="truncate text-xs text-neutral-600">
                  {describePage(item.pageUrl)} · {formatRelativeTime(item.createdAt, now)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {limit !== undefined && webUrl !== undefined && view.items.length > limit ? (
        <a
          href={`${webUrl}/app`}
          target="_blank"
          rel="noreferrer"
          className={`${LINK_BUTTON_CLASS} self-start`}
        >
          Open dashboard for the rest
        </a>
      ) : null}
    </section>
  );
}

export function NotificationsRow({ webUrl }: { webUrl: string }) {
  const [expanded, setExpanded] = useState(false);
  const [unread, setUnread] = useState(0);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="notifications-row-panel"
        onClick={() => {
          setExpanded((value) => !value);
        }}
        className={`${MENU_ITEM_CLASS} justify-between`}
      >
        <span>{notificationsLabel(unread)}</span>
        <span aria-hidden="true">{expanded ? "▴" : "▾"}</span>
      </button>
      <div id="notifications-row-panel" hidden={!expanded}>
        <NotificationsPanel
          onUnreadChange={setUnread}
          limit={NOTIFICATIONS_PREVIEW_SIZE}
          webUrl={webUrl}
        />
      </div>
    </div>
  );
}
