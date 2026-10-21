import { createSitenoteClient } from "@sitenote/db";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { browser } from "wxt/browser";

import { createAuthService } from "../auth-service";
import { getExtensionEnv } from "../env";
import { createMessageRouter } from "../message-router";
import type { AuthStateChangedMessage } from "../messages";
import { planRefresh, REFRESH_ALARM_NAME, type RefreshOutcome } from "../refresh-schedule";
import { createSessionStorage } from "../session-storage";

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
    onWake: keepSessionFresh,
  });

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    ignoreFailure(route(message, sender).then(sendResponse));
    return true;
  });
  browser.runtime.onStartup.addListener(() => {
    ignoreFailure(keepSessionFresh());
  });
  browser.runtime.onInstalled.addListener(() => {
    ignoreFailure(keepSessionFresh());
  });
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === REFRESH_ALARM_NAME) {
      ignoreFailure(keepSessionFresh());
    }
  });
}
