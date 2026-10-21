"use client";

import { useState, useSyncExternalStore, type SubmitEvent as FormSubmitEvent } from "react";

import { DISPLAY_NAME_MAX_LENGTH, parseDisplayName } from "../display-name";
import { sendSessionToExtension } from "../extension-bridge";
import {
  ERROR_CLASS,
  INPUT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../form-controls";
import { describeInviteError } from "../invite-error";
import { toOpenableOrigin } from "../origin-link";
import { getSupabaseBrowserClient } from "../supabase-browser";
import { forgetWebSession } from "../web-session";

const subscribeToNothing = () => () => undefined;
const isClient = () => true;
const isServer = () => false;

const SESSION_ERROR = "We could not start a guest session. Try again.";
const ALREADY_SIGNED_IN_CODE = "already_signed_in";

type Connection =
  | { status: "connecting" }
  | { status: "connected"; webCopyCleared: boolean }
  | { status: "missing" }
  | { status: "alreadySignedIn" }
  | { status: "failed" };

interface Joined {
  origins: readonly string[];
  connection: Connection;
}

type JoinOutcome = { kind: "joined"; origins: string[] } | { kind: "error"; message: string };

interface GuestJoinProps {
  token: string;
  workspaceName: string;
  extensionId: string;
}

async function joinWorkspace(token: string, displayName: string): Promise<JoinOutcome> {
  try {
    const supabase = getSupabaseBrowserClient();
    const existing = await supabase.auth.getSession();
    if (existing.data.session === null) {
      const started = await supabase.auth.signInAnonymously();
      if (started.error !== null) {
        return { kind: "error", message: SESSION_ERROR };
      }
    }
    const accepted = await supabase.rpc("accept_invite", {
      p_token: token,
      p_display_name: displayName,
    });
    if (accepted.error !== null) {
      return { kind: "error", message: describeInviteError(accepted.error.code) };
    }
    const workspaceId = accepted.data[0]?.workspace_id;
    if (workspaceId === undefined) {
      return { kind: "error", message: describeInviteError(undefined) };
    }
    const sites = await supabase
      .from("sites")
      .select("origin")
      .eq("workspace_id", workspaceId)
      .order("origin", { ascending: true });
    return {
      kind: "joined",
      origins: sites.error === null ? sites.data.map((site) => site.origin) : [],
    };
  } catch {
    return { kind: "error", message: describeInviteError(undefined) };
  }
}

async function connectExtension(extensionId: string): Promise<Connection> {
  try {
    const { data } = await getSupabaseBrowserClient().auth.getSession();
    if (data.session === null) {
      return { status: "failed" };
    }
    const result = await sendSessionToExtension(extensionId, {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    });
    if (result.status === "unavailable") {
      return { status: "missing" };
    }
    if (result.status === "rejected") {
      return result.code === ALREADY_SIGNED_IN_CODE
        ? { status: "alreadySignedIn" }
        : { status: "failed" };
    }
    return { status: "connected", webCopyCleared: await forgetWebSession() };
  } catch {
    return { status: "failed" };
  }
}

function InstallInstructions() {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
      <h2 className="font-semibold text-neutral-900">Install the Sitenote extension</h2>
      <p>
        You joined the workspace, but the Sitenote extension was not found in this browser. Install
        it to comment on the workspace sites.
      </p>
      <ol className="list-decimal pl-5">
        <li>
          While Sitenote is in development, open the extensions page of your browser and turn on
          developer mode.
        </li>
        <li>Choose Load unpacked and select the built extension folder.</li>
        <li>The Chrome Web Store listing will be available here once Sitenote is published.</li>
      </ol>
    </div>
  );
}

function ConnectionPanel({
  connection,
  onConnect,
}: {
  connection: Connection;
  onConnect: () => void;
}) {
  switch (connection.status) {
    case "connecting":
      return (
        <p role="status" className="text-neutral-700">
          Connecting the Sitenote extension...
        </p>
      );
    case "connected":
      return (
        <div className="flex flex-col gap-2">
          <p role="status" data-testid="extension-connected" className="font-medium">
            The Sitenote extension is connected.
          </p>
          {connection.webCopyCleared ? null : (
            <p className="text-sm text-neutral-600">
              This browser still holds a copy of the guest session on the web. Close this tab and do
              not sign in to the web app with it.
            </p>
          )}
        </div>
      );
    case "missing":
      return (
        <div className="flex flex-col gap-3">
          <InstallInstructions />
          <button type="button" onClick={onConnect} className={`${PRIMARY_BUTTON_CLASS} w-fit`}>
            I installed it — connect
          </button>
        </div>
      );
    case "alreadySignedIn":
      return (
        <div className="flex flex-col gap-3">
          <p role="alert" className={ERROR_CLASS}>
            The Sitenote extension is already signed in to an account. Open the extension popup,
            sign out, then connect again.
          </p>
          <button type="button" onClick={onConnect} className={`${SECONDARY_BUTTON_CLASS} w-fit`}>
            Connect again
          </button>
        </div>
      );
    case "failed":
      return (
        <div className="flex flex-col gap-3">
          <p role="alert" className={ERROR_CLASS}>
            The extension could not accept this guest session. Try connecting again.
          </p>
          <button type="button" onClick={onConnect} className={`${SECONDARY_BUTTON_CLASS} w-fit`}>
            Try connecting again
          </button>
        </div>
      );
  }
}

function SiteList({ origins, connected }: { origins: readonly string[]; connected: boolean }) {
  if (origins.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="sites-heading" className="flex flex-col gap-3">
      <h2 id="sites-heading" className="text-lg font-semibold">
        Sites to review
      </h2>
      {connected ? (
        <p className="text-neutral-700">
          Open a site below, click the Sitenote icon on that site and choose Enable.
        </p>
      ) : null}
      <ul className="flex flex-col divide-y divide-neutral-200 rounded-md border border-neutral-200">
        {origins.map((origin) => {
          const href = toOpenableOrigin(origin);
          return (
            <li key={origin} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="min-w-0 truncate text-sm text-neutral-700">{origin}</span>
              {href === null ? null : (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-sm font-medium text-neutral-900 underline underline-offset-4"
                >
                  Open {origin}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function GuestJoin({ token, workspaceName, extensionId }: GuestJoinProps) {
  const hydrated = useSyncExternalStore(subscribeToNothing, isClient, isServer);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<Joined | null>(null);

  function showConnection(connection: Connection) {
    setJoined((current) => (current === null ? null : { ...current, connection }));
  }

  async function connect() {
    showConnection({ status: "connecting" });
    showConnection(await connectExtension(extensionId));
  }

  async function handleSubmit(event: FormSubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }
    const displayName = parseDisplayName(name);
    if (displayName === null) {
      setError(`Enter a name of 1 to ${String(DISPLAY_NAME_MAX_LENGTH)} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await joinWorkspace(token, displayName);
    if (outcome.kind === "error") {
      setError(outcome.message);
      setBusy(false);
      return;
    }
    setJoined({ origins: outcome.origins, connection: { status: "connecting" } });
    setBusy(false);
    showConnection(await connectExtension(extensionId));
  }

  if (joined !== null) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold tracking-tight">You joined {workspaceName}</h1>
        <ConnectionPanel
          connection={joined.connection}
          onConnect={() => {
            void connect();
          }}
        />
        <SiteList origins={joined.origins} connected={joined.connection.status === "connected"} />
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="flex flex-col gap-4"
      aria-labelledby="guest-join-heading"
    >
      <h1 id="guest-join-heading" className="text-2xl font-bold tracking-tight">
        Join {workspaceName} as a guest
      </h1>
      <p className="text-neutral-600">
        Enter the name your team will see on your comments. You do not need an account.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="guest-name" className="text-sm font-medium text-neutral-700">
          Your name
        </label>
        <input
          id="guest-name"
          name="name"
          type="text"
          required
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          autoComplete="name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          aria-invalid={error !== null}
          aria-describedby={error === null ? undefined : "guest-join-error"}
          className={INPUT_CLASS}
        />
      </div>
      {error === null ? null : (
        <p id="guest-join-error" role="alert" className={ERROR_CLASS}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !hydrated}
        className={`${PRIMARY_BUTTON_CLASS} w-fit`}
      >
        {busy ? "Joining..." : "Join as guest"}
      </button>
    </form>
  );
}
