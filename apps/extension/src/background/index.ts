import { createSitenoteClient } from "@sitenote/db";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { browser } from "wxt/browser";

import { createAuthService } from "../auth-service";
import { createBadge } from "../badge";
import { createCommandListener } from "../command-listener";
import { createDataService } from "../data-service";
import { createEnablementStore } from "../enablement-store";
import { getExtensionEnv } from "../env";
import { createExternalRouter } from "../external-router";
import { createHubPort } from "../hub-port";
import { createMessageRouter } from "../message-router";
import { toggleCommentMode } from "../message-client";
import {
  PAGE_PORT_NAME,
  type AuthStateChangedMessage,
  type NotificationsChangedMessage,
} from "../messages";
import { createNotificationCenter } from "../notification-center";
import { createChannelFactory, createNotificationChannelFactory } from "../realtime-channels";
import { createRealtimeHub } from "../realtime-hub";
import { planRefresh, REFRESH_ALARM_NAME, type RefreshOutcome } from "../refresh-schedule";
import { createSessionHandoff } from "../session-handoff";
import { createSessionStorage } from "../session-storage";
import { createSiteEnablement } from "../site-enablement";

const BROADCAST_EVENTS: ReadonlySet<AuthChangeEvent> = new Set([
  "SIGNED_IN",
  "SIGNED_OUT",
  "USER_UPDATED",
]);

export function startBackground(): void {
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
  const data = createDataService({ client, getEnabledSite: store.get });
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

  function ignoreFailure(task: Promise<unknown>): void {
    task.catch(() => undefined);
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
    getEnabledSite: store.get,
    onWake: keepSessionFresh,
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
  browser.permissions.onRemoved.addListener(() => {
    ignoreFailure(enablement.reconcile());
  });
  browser.runtime.onStartup.addListener(() => {
    ignoreFailure(keepSessionFresh());
    ignoreFailure(enablement.reconcile());
    ignoreFailure(notifications.refresh());
  });
  browser.runtime.onInstalled.addListener(() => {
    ignoreFailure(keepSessionFresh());
    ignoreFailure(notifications.refresh());
  });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === REFRESH_ALARM_NAME) {
      ignoreFailure(keepSessionFresh());
      ignoreFailure(notifications.refresh());
    }
  });
}
