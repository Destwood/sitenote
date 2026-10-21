import { parsePageUrl } from "@sitenote/core";

import type { EnabledEntry } from "../enablement-store";
import { pageClientMessageSchema, type PageEvent, type PageSubscribeMessage } from "../messages";
import type {
  ChannelFactory,
  ChannelHandle,
  CommentChange,
  ThreadChange,
} from "../realtime-channels";

export interface HubPort {
  origin: string | null;
  post(event: PageEvent): void;
  disconnect(): void;
  onMessage(handler: (message: unknown) => void): void;
  onDisconnect(handler: () => void): void;
}

export interface RealtimeHubDeps {
  factory: ChannelFactory;
  getEnabledSite: (origin: string) => Promise<EnabledEntry | null>;
  findThreadPage: (threadId: string) => Promise<string | null>;
  hasSession: () => Promise<boolean>;
}

export interface HubSession {
  accessToken: string;
}

export interface RealtimeHub {
  attach: (port: HubPort) => void;
  onSession: (session: HubSession | null) => void;
  notifyDisabled: (origin: string) => void;
}

interface Subscriber {
  port: HubPort;
  origin: string;
  pageUrl: string;
}

interface SiteEntry {
  siteId: string;
  workspaceId: string;
  subscribers: Set<Subscriber>;
  pages: Map<string, string>;
  channel: ChannelHandle | null;
  subscribed: boolean;
  opening: Promise<void> | null;
}

export function createRealtimeHub(deps: RealtimeHubDeps): RealtimeHub {
  const entries = new Map<string, SiteEntry>();

  function deliver(subscriber: Subscriber, event: PageEvent): void {
    try {
      subscriber.port.post(event);
    } catch {
      subscriber.port.disconnect();
    }
  }

  function notifyPage(entry: SiteEntry, pageUrl: string, event: PageEvent): void {
    for (const subscriber of entry.subscribers) {
      if (subscriber.pageUrl === pageUrl) {
        deliver(subscriber, event);
      }
    }
  }

  function handleThread(entry: SiteEntry, change: ThreadChange): void {
    if (change.kind === "DELETE") {
      const pageUrl = entry.pages.get(change.id);
      entry.pages.delete(change.id);
      if (pageUrl !== undefined) {
        notifyPage(entry, pageUrl, { type: "threads.changed", threadId: change.id });
      }
      return;
    }
    if (change.pageUrl !== null) {
      entry.pages.set(change.id, change.pageUrl);
      notifyPage(entry, change.pageUrl, { type: "threads.changed", threadId: change.id });
    }
  }

  async function handleComment(entry: SiteEntry, change: CommentChange): Promise<void> {
    const pageUrl =
      entry.pages.get(change.threadId) ?? (await deps.findThreadPage(change.threadId));
    if (pageUrl === null) {
      return;
    }
    entry.pages.set(change.threadId, pageUrl);
    notifyPage(entry, pageUrl, { type: "comments.changed", threadId: change.threadId });
  }

  function openChannel(entry: SiteEntry): Promise<void> {
    if (entry.channel !== null) {
      return Promise.resolve();
    }
    entry.opening ??= (async () => {
      try {
        const signedIn = await deps.hasSession();
        const stillWanted = entries.get(entry.siteId) === entry && entry.channel === null;
        if (signedIn && stillWanted) {
          entry.channel = deps.factory.open(
            { siteId: entry.siteId, workspaceId: entry.workspaceId },
            {
              onThread: (change) => {
                handleThread(entry, change);
              },
              onComment: (change) => {
                void handleComment(entry, change).catch(() => undefined);
              },
              onSubscribed: () => {
                entry.subscribed = true;
                for (const subscriber of entry.subscribers) {
                  deliver(subscriber, { type: "page.subscribed" });
                }
              },
            },
          );
        }
      } finally {
        entry.opening = null;
      }
    })();
    return entry.opening;
  }

  function closeChannel(entry: SiteEntry): void {
    entry.channel?.close();
    entry.channel = null;
    entry.subscribed = false;
  }

  function release(entry: SiteEntry, subscriber: Subscriber): void {
    entry.subscribers.delete(subscriber);
    if (entry.subscribers.size === 0) {
      closeChannel(entry);
      if (entries.get(entry.siteId) === entry) {
        entries.delete(entry.siteId);
      }
    }
  }

  async function subscribe(
    port: HubPort,
    origin: string,
    message: PageSubscribeMessage,
  ): Promise<{ entry: SiteEntry; subscriber: Subscriber } | null> {
    const enabled = await deps.getEnabledSite(origin);
    const allowed =
      enabled?.siteId === message.siteId &&
      enabled.workspaceId === message.workspaceId &&
      parsePageUrl(message.pageUrl)?.site === origin;
    if (!allowed) {
      return null;
    }
    let entry = entries.get(message.siteId);
    if (entry === undefined) {
      entry = {
        siteId: message.siteId,
        workspaceId: message.workspaceId,
        subscribers: new Set(),
        pages: new Map(),
        channel: null,
        subscribed: false,
        opening: null,
      };
      entries.set(message.siteId, entry);
    }
    const subscriber: Subscriber = { port, origin, pageUrl: message.pageUrl };
    entry.subscribers.add(subscriber);
    return { entry, subscriber };
  }

  function attach(port: HubPort): void {
    const origin = port.origin;
    if (origin === null) {
      port.disconnect();
      return;
    }
    let joined: { entry: SiteEntry; subscriber: Subscriber } | null = null;
    let subscribing = false;
    let closed = false;

    function leave(): void {
      if (joined !== null) {
        release(joined.entry, joined.subscriber);
        joined = null;
      }
    }

    function reject(): void {
      closed = true;
      leave();
      port.disconnect();
    }

    port.onMessage((raw) => {
      const parsed = pageClientMessageSchema.safeParse(raw);
      if (!parsed.success || closed) {
        reject();
        return;
      }
      const message = parsed.data;
      if (message.type === "page.subscribe") {
        if (joined !== null || subscribing) {
          reject();
          return;
        }
        subscribing = true;
        void subscribe(port, origin, message)
          .then(async (result) => {
            if (result === null || closed) {
              if (result !== null) {
                release(result.entry, result.subscriber);
              }
              reject();
              return;
            }
            joined = result;
            await openChannel(result.entry);
            if (result.entry.channel === null || result.entry.subscribed) {
              deliver(result.subscriber, { type: "page.subscribed" });
            }
          })
          .catch(reject);
        return;
      }
      if (joined === null || parsePageUrl(message.pageUrl)?.site !== origin) {
        reject();
        return;
      }
      joined.subscriber.pageUrl = message.pageUrl;
    });

    port.onDisconnect(() => {
      closed = true;
      leave();
    });
  }

  return {
    attach,

    onSession(session) {
      if (session === null) {
        for (const entry of entries.values()) {
          closeChannel(entry);
        }
        return;
      }
      deps.factory.setAuth(session.accessToken);
      for (const entry of entries.values()) {
        void openChannel(entry).catch(() => undefined);
      }
    },

    notifyDisabled(origin) {
      for (const entry of [...entries.values()]) {
        for (const subscriber of [...entry.subscribers]) {
          if (subscriber.origin === origin) {
            deliver(subscriber, { type: "site.disabled" });
            release(entry, subscriber);
            subscriber.port.disconnect();
          }
        }
      }
    },
  };
}
