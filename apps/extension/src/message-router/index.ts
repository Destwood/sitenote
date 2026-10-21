import { parsePageUrl } from "@sitenote/core";

import type { AuthService } from "../auth-service";
import type { DataService } from "../data-service";
import type { EnabledEntry } from "../enablement-store";
import {
  failure,
  requestSchema,
  type DataByRequestType,
  type ExtensionRequest,
  type MessageResult,
} from "../messages";
import type { SiteEnablement } from "../site-enablement";

export interface RouterSender {
  id?: string | undefined;
  url?: string | undefined;
  tab?: { id?: number | undefined } | undefined;
}

export interface MessageRouterDeps {
  extensionId: string;
  service: AuthService;
  data: DataService;
  enablement: SiteEnablement;
  getEnabledSite: (origin: string) => Promise<EnabledEntry | null>;
  onWake: () => Promise<void>;
}

export type RouterResponse = MessageResult<DataByRequestType[ExtensionRequest["type"]]>;

export type MessageRouter = (message: unknown, sender: RouterSender) => Promise<RouterResponse>;

type SenderKind = "extensionPage" | "contentScript" | "foreign";

const PAGE_SCOPED: ReadonlySet<ExtensionRequest["type"]> = new Set([
  "threads.list",
  "threads.create",
  "threads.setStatus",
  "comments.create",
  "comments.update",
  "comments.delete",
]);

export function senderOriginOf(sender: RouterSender): string | null {
  const url = sender.url === undefined ? null : URL.parse(sender.url);
  return url === null ? null : url.origin;
}

export function createMessageRouter(deps: MessageRouterDeps): MessageRouter {
  const { service, data, enablement } = deps;
  const extensionPrefix = `chrome-extension://${deps.extensionId}/`;

  function classify(sender: RouterSender): SenderKind {
    if (sender.id !== deps.extensionId) {
      return "foreign";
    }
    if (sender.url?.startsWith(extensionPrefix) === true) {
      return "extensionPage";
    }
    return sender.tab === undefined ? "foreign" : "contentScript";
  }

  async function authorizePage(
    request: ExtensionRequest,
    sender: RouterSender,
  ): Promise<RouterResponse | null> {
    const origin = senderOriginOf(sender);
    if (sender.tab === undefined || origin === null) {
      return failure("forbidden_sender");
    }
    const enabled = await deps.getEnabledSite(origin);
    if (enabled === null) {
      return failure("forbidden");
    }
    if (request.type === "threads.list" || request.type === "threads.create") {
      const sameSite = enabled.siteId === request.siteId;
      const samePage = parsePageUrl(request.pageUrl)?.site === origin;
      if (!sameSite || !samePage) {
        return failure("forbidden");
      }
    }
    return null;
  }

  return async (message, sender) => {
    const kind = classify(sender);
    if (kind === "foreign") {
      return failure("forbidden_sender");
    }
    const parsed = requestSchema.safeParse(message);
    if (!parsed.success) {
      return failure("invalid_request");
    }
    const request = parsed.data;

    if (PAGE_SCOPED.has(request.type)) {
      const denied = await authorizePage(request, sender);
      if (denied !== null) {
        return denied;
      }
    } else if (request.type === "sites.forOrigin") {
      if (kind === "contentScript" && request.origin !== senderOriginOf(sender)) {
        return failure("forbidden");
      }
    } else if (kind !== "extensionPage") {
      return failure("forbidden_sender");
    }

    await deps.onWake().catch(() => undefined);

    switch (request.type) {
      case "auth.getState":
        return service.getState();
      case "auth.sendCode":
        return service.sendCode(request.email);
      case "auth.verifyCode":
        return service.verifyCode(request.email, request.code);
      case "auth.signInWithGoogle":
        return service.signInWithGoogle();
      case "auth.signOut":
        return service.signOut();
      case "sites.forOrigin":
        return data.forOrigin(request);
      case "threads.list":
        return data.listThreads(request);
      case "threads.create":
        return data.createThread(request);
      case "threads.setStatus":
        return data.setThreadStatus(request);
      case "comments.create":
        return data.createComment(request);
      case "comments.update":
        return data.updateComment(request);
      case "comments.delete":
        return data.deleteComment(request);
      case "workspaces.list":
        return data.listWorkspaces();
      case "sites.enable":
        return enablement.enable(request);
      case "sites.disable":
        return enablement.disable(request.origin);
    }
  };
}
