import { createSitenoteClient } from "@sitenote/db";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { browser } from "wxt/browser";

import { createAuthService } from "../auth-service";
import { createBadge } from "../badge";
import { createCaptureStore } from "../capture-store";
import { createCommandListener } from "../command-listener";
import { createContextMenuClickListener, createContextMenuSync } from "../context-menu";
import { createDataService } from "../data-service";
import { createEnablementStore, ENABLEMENT_STORAGE_KEY } from "../enablement-store";
import { getExtensionEnv } from "../env";
import { createExternalRouter } from "../external-router";
import { createHubPort } from "../hub-port";
import { createMessageRouter } from "../message-router";
import { commentOnElement, toggleCommentMode } from "../message-client";
import {
  PAGE_PORT_NAME,
  type AuthStateChangedMessage,
  type NotificationsChangedMessage,
} from "../messages";
import { createNotificationCenter } from "../notification-center";
import { createPendingEnable } from "../pending-enable";
import { createChannelFactory, createNotificationChannelFactory } from "../realtime-channels";
import { createRealtimeHub } from "../realtime-hub";
import { planRefresh, REFRESH_ALARM_NAME, type RefreshOutcome } from "../refresh-schedule";
import { createResolvedPreference } from "../resolved-preference";
import { cropDataUrl } from "../screenshot-crop";
import { createScreenshotService } from "../screenshot-service";
import { createSelectionPlacementPreference } from "../selection-placement";
import { createScreenshotUploader } from "../screenshot-upload";
import { createSessionHandoff } from "../session-handoff";
import { createSessionStorage } from "../session-storage";
import { createSiteEnablement } from "../site-enablement";
import { restrictToTrustedContexts } from "../storage-access";
import { createTestHooks } from "../test-hooks";

const BROADCAST_EVENTS: ReadonlySet<AuthChangeEvent> = new Set([
  "SIGNED_IN",
  "SIGNED_OUT",
  "USER_UPDATED",
]);

function ignoreFailure(task: Promise<unknown>): void {
  task.catch(() => undefined);
}

export function startBackground(): void {
  ignoreFailure(restrictToTrustedContexts(browser.storage.local));
  const env = getExtensionEnv();
  const storage = createSessionStorage(browser.storage.local);
  const client = createSitenoteClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: {
      storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
  const service = createAuthService({
    client,
    storage,
    googleEnabled: env.googleAuthEnabled,
    getRedirectUrl: () => browser.identity.getRedirectURL(),
    launchWebAuthFlow: (url) => browser.identity.launchWebAuthFlow({ url, interactive: true }),
  });

  const store = createEnablementStore(browser.storage.local);
  const hooks = __SITENOTE_E2E__ ? createTestHooks() : null;
  const captures = createCaptureStore();
  const data = createDataService({
    client,
    getEnabledSite: store.get,
    screenshots: createScreenshotUploader({
      client,
      store: captures,
      ...(hooks === null ? {} : { consumeFailure: hooks.consumeUploadFailure }),
    }),
  });
  const screenshots = createScreenshotService({
    store: captures,
    captureVisibleTab: (windowId) => browser.tabs.captureVisibleTab(windowId, { format: "png" }),
    crop: cropDataUrl,
    getTab: async (tabId) => {
      try {
        const tab = await browser.tabs.get(tabId);
        return { active: tab.active, windowId: tab.windowId, url: tab.url };
      } catch {
        return null;
      }
    },
    wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  });
  const hub = createRealtimeHub({
    factory: createChannelFactory(client),
    getEnabledSite: store.get,
    findThreadPage: data.findThreadPage,
    hasSession: data.hasSession,
  });
  const notifications = createNotificationCenter({
    data,
    channels: createNotificationChannelFactory(client),
    badge: createBadge(browser.action),
    announce: (unread) => {
      const message: NotificationsChangedMessage = { type: "notifications.changed", unread };
      return browser.runtime.sendMessage(message).catch(() => undefined);
    },
  });
  const enablement = createSiteEnablement({
    store,
    data,
    scripting: browser.scripting,
    permissions: browser.permissions,
    onDisabled: hub.notifyDisabled,
  });
  const syncContextMenu = createContextMenuSync({
    removeAll: () => browser.contextMenus.removeAll(),
    create: (properties) => {
      browser.contextMenus.create(properties);
    },
    listOrigins: async () => Object.keys(await store.list()),
  });

  const pending = createPendingEnable(browser.storage.local);

  async function enableAfterGrant(pattern: string): Promise<void> {
    const origin = pattern.replace(/\/\*$/, "");
    const entry = await pending.take(origin);
    if (entry === null) {
      return;
    }
    const result = await enablement.enable(entry);
    if (!result.ok) {
      await browser.permissions.remove({ origins: [`${origin}/*`] }).catch(() => false);
    }
  }

  async function scheduleRefresh(outcome: RefreshOutcome): Promise<void> {
    const when = planRefresh(outcome, Date.now());
    if (when === null) {
      await browser.alarms.clear(REFRESH_ALARM_NAME);
    } else {
      await browser.alarms.create(REFRESH_ALARM_NAME, { when });
    }
  }

  async function keepSessionFresh(): Promise<void> {
    const { outcome } = await service.keepFresh();
    await scheduleRefresh(outcome);
  }

  async function handleAuthChange(event: AuthChangeEvent, session: Session | null): Promise<void> {
    hub.onSession(session === null ? null : { accessToken: session.access_token });
    notifications.onSession(session === null ? null : { userId: session.user.id });
    await scheduleRefresh(
      session === null
        ? { status: "signedOut" }
        : { status: "active", expiresAt: session.expires_at },
    );
    if (BROADCAST_EVENTS.has(event)) {
      const message: AuthStateChangedMessage = {
        type: "auth.stateChanged",
        state: await service.describeSession(session),
      };
      await browser.runtime.sendMessage(message);
    }
  }

  client.auth.onAuthStateChange((event, session) => {
    setTimeout(() => {
      ignoreFailure(handleAuthChange(event, session));
    }, 0);
  });

  const route = createMessageRouter({
    extensionId: browser.runtime.id,
    service,
    data,
    enablement,
    notifications,
    screenshots,
    preferences: createResolvedPreference(browser.storage.local),
    selectionPlacement: createSelectionPlacementPreference(browser.storage.local),
    getEnabledSite: store.get,
    onWake: keepSessionFresh,
    handleTestMessage: hooks?.handle,
  });

  const routeExternal = createExternalRouter({
    webOrigin: new URL(env.webUrl).origin,
    handoff: createSessionHandoff({
      client,
      createProbe: (accessToken) =>
        createSitenoteClient(env.supabaseUrl, env.supabasePublishableKey, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          global: { headers: { Authorization: `Bearer ${accessToken}` } },
        }),
    }),
  });

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    ignoreFailure(route(message, sender).then(sendResponse));
    return true;
  });
  browser.runtime.onMessageExternal.addListener((message: unknown, sender, sendResponse) => {
    ignoreFailure(routeExternal(message, sender).then(sendResponse));
    return true;
  });
  browser.runtime.onConnect.addListener((port) => {
    if (port.name === PAGE_PORT_NAME) {
      hub.attach(createHubPort(port, browser.runtime.id));
    }
  });
  browser.commands.onCommand.addListener(createCommandListener(toggleCommentMode));
  browser.contextMenus.onClicked.addListener(createContextMenuClickListener({ commentOnElement }));
  browser.permissions.onRemoved.addListener(() => {
    ignoreFailure(enablement.reconcile());
  });
  browser.permissions.onAdded.addListener((permissions) => {
    for (const pattern of permissions.origins ?? []) {
      ignoreFailure(enableAfterGrant(pattern));
    }
  });
  browser.runtime.onStartup.addListener(() => {
    ignoreFailure(keepSessionFresh());
    ignoreFailure(enablement.reconcile());
    ignoreFailure(notifications.refresh());
    ignoreFailure(syncContextMenu());
  });
  browser.runtime.onInstalled.addListener(() => {
    ignoreFailure(keepSessionFresh());
    ignoreFailure(enablement.reconcile());
    ignoreFailure(notifications.refresh());
    ignoreFailure(syncContextMenu());
  });
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && ENABLEMENT_STORAGE_KEY in changes) {
      ignoreFailure(syncContextMenu());
    }
  });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === REFRESH_ALARM_NAME) {
      ignoreFailure(keepSessionFresh());
      ignoreFailure(notifications.refresh());
    }
  });
}
