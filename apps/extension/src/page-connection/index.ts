import {
  PAGE_PORT_NAME,
  pageEventSchema,
  type PageClientMessage,
  type PageEvent,
} from "../messages";

export const INITIAL_BACKOFF_MS = 500;
export const MAX_BACKOFF_MS = 30_000;

export interface ClientPort {
  postMessage(message: PageClientMessage): void;
  disconnect(): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

export interface PageSubscription {
  siteId: string;
  workspaceId: string;
  getPageUrl: () => string;
}

export interface PageConnectionOptions {
  connect: (name: string) => ClientPort;
  subscription: PageSubscription;
  onEvent: (event: Exclude<PageEvent, { type: "page.subscribed" }>) => void;
  onSubscribed: () => void;
  onDisconnected: () => void;
}

export interface PageConnection {
  update: (pageUrl: string) => void;
  close: () => void;
}

export function openPageConnection(options: PageConnectionOptions): PageConnection {
  const { subscription } = options;
  let port: ClientPort | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let delay = INITIAL_BACKOFF_MS;
  let closed = false;

  function scheduleReconnect(): void {
    if (closed || timer !== null) {
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      open();
    }, delay);
    delay = Math.min(delay * 2, MAX_BACKOFF_MS);
  }

  function handleMessage(raw: unknown): void {
    const parsed = pageEventSchema.safeParse(raw);
    if (!parsed.success) {
      return;
    }
    const event = parsed.data;
    if (event.type === "page.subscribed") {
      delay = INITIAL_BACKOFF_MS;
      options.onSubscribed();
      return;
    }
    if (event.type === "site.disabled") {
      close();
    }
    options.onEvent(event);
  }

  function open(): void {
    if (closed) {
      return;
    }
    let current: ClientPort;
    try {
      current = options.connect(PAGE_PORT_NAME);
    } catch {
      closed = true;
      return;
    }
    port = current;
    current.onMessage.addListener(handleMessage);
    current.onDisconnect.addListener(() => {
      if (port === current) {
        port = null;
        options.onDisconnected();
        scheduleReconnect();
      }
    });
    current.postMessage({
      type: "page.subscribe",
      siteId: subscription.siteId,
      workspaceId: subscription.workspaceId,
      pageUrl: subscription.getPageUrl(),
    });
  }

  function close(): void {
    closed = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    const current = port;
    port = null;
    current?.disconnect();
  }

  open();

  return {
    update: (pageUrl) => {
      port?.postMessage({ type: "page.update", pageUrl });
    },
    close,
  };
}
