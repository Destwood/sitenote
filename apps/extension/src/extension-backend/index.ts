import { createContextCollector, type WidgetBackend } from "@sitenote/widget";
import { browser } from "wxt/browser";

import { sendMessage } from "../message-client";
import { requestConsoleErrors, requestPageDiagnostics } from "../errors-bridge";
import { openPageConnection } from "../page-connection";

export function createExtensionBackend(): WidgetBackend {
  return {
    getSiteInfo: (origin) => sendMessage({ type: "sites.forOrigin", origin }),
    listThreads: (siteId, pageUrl) => sendMessage({ type: "threads.list", siteId, pageUrl }),
    listSiteThreads: (siteId) => sendMessage({ type: "threads.listSite", siteId }),
    createThread: (input) => sendMessage({ type: "threads.create", ...input }),
    setStatus: (threadId, status) => sendMessage({ type: "threads.setStatus", threadId, status }),
    createComment: (input) => sendMessage({ type: "comments.create", ...input }),
    updateComment: (input) => sendMessage({ type: "comments.update", ...input }),
    deleteComment: (commentId) => sendMessage({ type: "comments.delete", commentId }),
    listMembers: (workspaceId) => sendMessage({ type: "members.list", workspaceId }),
    subscribe: (subscription, handlers) =>
      openPageConnection({
        ...handlers,
        subscription,
        connect: (name) => browser.runtime.connect({ name }),
      }),
    captureScreenshot: (rect, devicePixelRatio) =>
      sendMessage({ type: "screenshot.capture", rect, devicePixelRatio }),
    getScreenshotUrl: (threadId) => sendMessage({ type: "threads.screenshotUrl", threadId }),
    getRecordingUrl: (threadId) => sendMessage({ type: "threads.recordingUrl", threadId }),
    getReplaySource: (threadId) => sendMessage({ type: "threads.replaySource", threadId }),
    collectContext: createContextCollector({
      win: window,
      doc: document,
      requestErrors: () => requestConsoleErrors({ win: window }),
      requestDiagnostics: () => requestPageDiagnostics({ win: window }),
    }),
    getPreference: (siteId) => sendMessage({ type: "preferences.get", siteId }),
    setPreference: (siteId, showResolved) =>
      sendMessage({ type: "preferences.set", siteId, showResolved }),
    getClickUpStatus: (workspaceId) => sendMessage({ type: "clickup.status", workspaceId }),
    createClickUpTask: (threadId) => sendMessage({ type: "clickup.createTask", threadId }),
    getJiraStatus: (workspaceId) => sendMessage({ type: "jira.status", workspaceId }),
    linkJiraIssue: (threadId, issueKey) =>
      sendMessage({ type: "jira.linkIssue", threadId, issueKey }),
    getSelectionPlacement: () => sendMessage({ type: "preferences.getSelectionPlacement" }),
    replayProgress: {
      load: async () => {
        const reply = await sendMessage({ type: "replay.load" });
        return reply.ok ? reply.data : null;
      },
      save: async (progress) => {
        await sendMessage({ type: "replay.save", progress });
      },
      clear: async () => {
        await sendMessage({ type: "replay.clear" });
      },
    },
  };
}
