"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type SyntheticEvent } from "react";

import {
  disconnectJira,
  saveJiraSettings,
  type JiraConnection,
  type JiraFailure,
} from "../jira-api";
import {
  DASH_BUTTON_DANGER_CLASS,
  DASH_BUTTON_PRIMARY_CLASS,
  DASH_ERROR_CLASS,
  DASH_INPUT_CLASS,
  DASH_LABEL_CLASS,
} from "../dashboard-classes";
import { getSupabaseBrowserClient } from "../supabase-browser";

const DISCONNECT_CONFIRMATION = "Disconnect Jira? Issues already linked stay linked.";

interface JiraIntegrationFormProps {
  workspaceId: string;
  connection: JiraConnection | null;
}

export function JiraIntegrationForm({ workspaceId, connection }: JiraIntegrationFormProps) {
  const router = useRouter();
  const ids = {
    site: useId(),
    email: useId(),
    token: useId(),
  };
  const [siteUrl, setSiteUrl] = useState(connection?.siteUrl ?? "");
  const [email, setEmail] = useState(connection?.email ?? "");
  const [token, setToken] = useState("");
  const [error, setError] = useState<JiraFailure | null>(null);
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } finally {
      setPending(false);
    }
  }

  function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      const outcome = await saveJiraSettings(getSupabaseBrowserClient(), {
        workspaceId,
        siteUrl,
        email,
        token: token.length > 0 ? token : undefined,
      });
      if (!outcome.ok) {
        setError(outcome);
        return;
      }
      setToken("");
      router.refresh();
    });
  }

  function disconnect() {
    if (!window.confirm(DISCONNECT_CONFIRMATION)) {
      return;
    }
    void run(async () => {
      const outcome = await disconnectJira(getSupabaseBrowserClient(), workspaceId);
      if (!outcome.ok) {
        setError(outcome);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {connection === null ? null : (
        <section aria-labelledby={`${ids.site}-status`} className="flex flex-col gap-3">
          <h2 id={`${ids.site}-status`} className="text-base font-semibold text-neutral-900">
            Connected
          </h2>
          <p className="text-neutral-700">
            Linking issues on {connection.siteUrl} as {connection.email}.
          </p>
          <div>
            <button
              type="button"
              onClick={disconnect}
              disabled={pending}
              className={DASH_BUTTON_DANGER_CLASS}
            >
              Disconnect
            </button>
          </div>
        </section>
      )}

      <form onSubmit={save} className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-neutral-900">
          {connection === null ? "Connect Jira" : "Change the connection"}
        </h2>
        <label htmlFor={ids.site} className={DASH_LABEL_CLASS}>
          Site URL
          <input
            id={ids.site}
            type="url"
            placeholder="https://your-site.atlassian.net"
            autoComplete="off"
            spellCheck={false}
            value={siteUrl}
            onChange={(event) => {
              setSiteUrl(event.target.value);
            }}
            className={DASH_INPUT_CLASS}
          />
        </label>
        <label htmlFor={ids.email} className={DASH_LABEL_CLASS}>
          Email
          <input
            id={ids.email}
            type="email"
            autoComplete="off"
            spellCheck={false}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
            className={DASH_INPUT_CLASS}
          />
        </label>
        <label htmlFor={ids.token} className={DASH_LABEL_CLASS}>
          {connection === null ? "API token" : "Replace the API token (optional)"}
          <input
            id={ids.token}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(event) => {
              setToken(event.target.value);
            }}
            className={DASH_INPUT_CLASS}
          />
        </label>
        <button type="submit" disabled={pending} className={`${DASH_BUTTON_PRIMARY_CLASS} w-fit`}>
          Save Jira connection
        </button>
      </form>

      {error === null ? null : (
        <p role="alert" data-error-code={error.code} className={DASH_ERROR_CLASS}>
          {error.message}
        </p>
      )}
    </div>
  );
}
