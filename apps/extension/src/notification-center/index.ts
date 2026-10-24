import type { Badge } from "../badge";
import type { DataService } from "../data-service";
import type { MessageResult } from "@sitenote/widget";
import type { NotificationChannelFactory } from "../realtime-channels";
import type { NotificationList } from "@sitenote/widget";

export type NotificationData = Pick<
  DataService,
  | "listNotifications"
  | "markNotificationsRead"
  | "markAllNotificationsRead"
  | "countUnreadNotifications"
>;

export interface NotificationCenterDeps {
  data: NotificationData;
  channels: NotificationChannelFactory;
  badge: Badge;
  announce: (unread: number) => Promise<unknown>;
}

export interface NotificationCenter {
  onSession: (session: { userId: string } | null) => void;
  refresh: () => Promise<void>;
  list: (limit: number) => Promise<MessageResult<NotificationList>>;
  markRead: (ids: string[]) => Promise<MessageResult<null>>;
  markAllRead: () => Promise<MessageResult<null>>;
}

export function createNotificationCenter(deps: NotificationCenterDeps): NotificationCenter {
  let userId: string | null = null;
  let channel: { close: () => void } | null = null;
  let unread = 0;
  let inFlight: Promise<void> | null = null;
  let requested = 0;

  async function apply(count: number): Promise<void> {
    const changed = count !== unread;
    unread = count;
    await Promise.allSettled([deps.badge.show(count), changed ? deps.announce(count) : null]);
  }

  async function refreshOnce(): Promise<void> {
    const forUser = userId;
    if (forUser === null) {
      await apply(0);
      return;
    }
    const result = await deps.data.countUnreadNotifications().catch(() => null);
    if (result?.ok === true && userId === forUser) {
      await apply(result.data);
    }
  }

  function refresh(): Promise<void> {
    requested += 1;
    if (inFlight !== null) {
      return inFlight;
    }
    inFlight = (async () => {
      try {
        let served = -1;
        while (served !== requested) {
          served = requested;
          await refreshOnce();
        }
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  function closeChannel(): void {
    channel?.close();
    channel = null;
  }

  async function afterWrite(result: MessageResult<null>): Promise<MessageResult<null>> {
    if (result.ok) {
      await refresh();
    }
    return result;
  }

  return {
    onSession(session) {
      if (session === null) {
        closeChannel();
        userId = null;
        void refresh();
        return;
      }
      if (session.userId === userId && channel !== null) {
        return;
      }
      closeChannel();
      userId = session.userId;
      channel = deps.channels.open(session.userId, {
        onChange: () => {
          void refresh();
        },
        onSubscribed: () => {
          void refresh();
        },
      });
      void refresh();
    },

    refresh,

    async list(limit) {
      const result = await deps.data.listNotifications({ type: "notifications.list", limit });
      if (result.ok) {
        await apply(result.data.unread);
      }
      return result;
    },

    async markRead(ids) {
      return afterWrite(
        await deps.data.markNotificationsRead({ type: "notifications.markRead", ids }),
      );
    },

    async markAllRead() {
      return afterWrite(await deps.data.markAllNotificationsRead());
    },
  };
}
