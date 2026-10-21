import * as z from "zod/mini";

export type ThreadChangeKind = "INSERT" | "UPDATE" | "DELETE";

export interface ThreadChange {
  kind: ThreadChangeKind;
  id: string;
  pageUrl: string | null;
}

export interface CommentChange {
  threadId: string;
}

export interface ChannelHandlers {
  onThread: (change: ThreadChange) => void;
  onComment: (change: CommentChange) => void;
  onSubscribed: (rejoined: boolean) => void;
}

export interface ChannelScope {
  siteId: string;
  workspaceId: string;
}

export interface ChannelHandle {
  close: () => void;
}

export interface ChannelFactory {
  open: (scope: ChannelScope, handlers: ChannelHandlers) => ChannelHandle;
  setAuth: (token: string | null) => void;
}

interface ChangeFilter {
  event: "*";
  schema: "public";
  table: "threads" | "comments";
  filter: string;
}

export interface ChannelLike {
  on(
    type: "postgres_changes",
    filter: ChangeFilter,
    callback: (payload: unknown) => void,
  ): ChannelLike;
  subscribe(callback?: (status: string) => void): ChannelLike;
}

export interface RealtimeClientLike {
  channel(name: string): ChannelLike;
  removeChannel(channel: ChannelLike): Promise<unknown>;
  realtime: { setAuth(token?: string | null): Promise<void> };
}

const record = z.record(z.string(), z.unknown());
const payloadSchema = z.object({
  eventType: z.enum(["INSERT", "UPDATE", "DELETE"]),
  new: z.optional(record),
  old: z.optional(record),
});

function stringField(source: Readonly<Record<string, unknown>> | undefined, key: string) {
  const value = source?.[key];
  return typeof value === "string" ? value : null;
}

export function createChannelFactory(client: RealtimeClientLike): ChannelFactory {
  return {
    open(scope, handlers) {
      let subscribedBefore = false;
      const channel = client
        .channel(`sitenote:site:${scope.siteId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "threads", filter: `site_id=eq.${scope.siteId}` },
          (raw) => {
            const payload = payloadSchema.safeParse(raw);
            if (!payload.success) {
              return;
            }
            const row = payload.data.eventType === "DELETE" ? payload.data.old : payload.data.new;
            const id = stringField(row, "id");
            if (id !== null) {
              handlers.onThread({
                kind: payload.data.eventType,
                id,
                pageUrl: stringField(row, "page_url"),
              });
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "comments",
            filter: `workspace_id=eq.${scope.workspaceId}`,
          },
          (raw) => {
            const payload = payloadSchema.safeParse(raw);
            const threadId = payload.success ? stringField(payload.data.new, "thread_id") : null;
            if (threadId !== null) {
              handlers.onComment({ threadId });
            }
          },
        )
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") {
            return;
          }
          handlers.onSubscribed(subscribedBefore);
          subscribedBefore = true;
        });
      return {
        close: () => {
          void client.removeChannel(channel);
        },
      };
    },
    setAuth: (token) => {
      void client.realtime.setAuth(token);
    },
  };
}
