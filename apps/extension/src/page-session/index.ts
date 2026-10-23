import type { ErrorCode, ExtensionRequest, MessageResult, DataByRequestType } from "../messages";
import type { PageConnection, PageConnectionOptions } from "../page-connection";
import type { SiteInfo, ThreadRecord } from "../transport";

export type PageSessionStatus = "starting" | "signedOut" | "disabled" | "ready" | "error";

export interface PageSessionState {
  status: PageSessionStatus;
  site: SiteInfo | null;
  threads: ThreadRecord[];
  loaded: boolean;
  live: boolean;
  error: ErrorCode | null;
}

export interface PageSessionDeps {
  origin: string;
  readPageUrl: () => string | null;
  send: <Request extends ExtensionRequest>(
    request: Request,
  ) => Promise<MessageResult<DataByRequestType[Request["type"]]>>;
  openConnection: (options: Omit<PageConnectionOptions, "connect">) => PageConnection;
  onState: (state: PageSessionState) => void;
}

export interface PageSession {
  start: () => Promise<void>;
  navigate: () => void;
  refresh: () => Promise<void>;
  stop: () => void;
}

export function createPageSession(deps: PageSessionDeps): PageSession {
  let state: PageSessionState = {
    status: "starting",
    site: null,
    threads: [],
    loaded: false,
    live: false,
    error: null,
  };
  let connection: PageConnection | null = null;
  let stopped = false;
  let inFlight: Promise<void> | null = null;
  let requested = 0;

  function publish(next: PageSessionState): void {
    state = next;
    if (!stopped) {
      deps.onState(state);
    }
  }

  async function fetchThreads(): Promise<void> {
    const site = state.site;
    const pageUrl = deps.readPageUrl();
    if (site === null || pageUrl === null) {
      return;
    }
    const result = await deps.send({ type: "threads.list", siteId: site.siteId, pageUrl });
    if (stopped || deps.readPageUrl() !== pageUrl) {
      return;
    }
    publish(
      result.ok
        ? { ...state, status: "ready", threads: result.data, loaded: true, error: null }
        : { ...state, status: "error", error: result.error.code },
    );
  }

  function refresh(): Promise<void> {
    requested += 1;
    if (inFlight !== null) {
      return inFlight;
    }
    inFlight = (async () => {
      try {
        let served = -1;
        while (served !== requested && !stopped) {
          served = requested;
          await fetchThreads();
        }
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  async function start(): Promise<void> {
    publish(state);
    const result = await deps.send({ type: "sites.forOrigin", origin: deps.origin });
    if (stopped) {
      return;
    }
    if (!result.ok) {
      publish({
        ...state,
        status: result.error.code === "unauthorized" ? "signedOut" : "error",
        error: result.error.code,
      });
      return;
    }
    const site = result.data;
    if (site === null) {
      publish({ ...state, status: "disabled" });
      return;
    }
    publish({ ...state, status: "ready", site });
    connection = deps.openConnection({
      subscription: {
        siteId: site.siteId,
        workspaceId: site.workspaceId,
        getPageUrl: () => deps.readPageUrl() ?? deps.origin,
      },
      onEvent: (event) => {
        if (event.type === "site.disabled") {
          publish({
            status: "disabled",
            site: null,
            threads: [],
            loaded: false,
            live: false,
            error: null,
          });
          stop();
          return;
        }
        void refresh();
      },
      onSubscribed: () => {
        publish({ ...state, live: true });
        void refresh();
      },
      onDisconnected: () => {
        publish({ ...state, live: false });
      },
    });
    await refresh();
  }

  function stop(): void {
    stopped = true;
    connection?.close();
    connection = null;
  }

  return {
    start,
    refresh,
    navigate: () => {
      publish({ ...state, loaded: false });
      const pageUrl = deps.readPageUrl();
      if (pageUrl !== null) {
        connection?.update(pageUrl);
      }
      void refresh();
    },
    stop,
  };
}
