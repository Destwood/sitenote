"use client";

import { useId, useState } from "react";

import { CopyLink } from "../copy-link";
import {
  DASH_BUTTON_SECONDARY_CLASS,
  DASH_CARD_CLASS,
  DASH_ERROR_CLASS,
} from "../dashboard-classes";
import { getSupabaseBrowserClient } from "../supabase-browser";
import type { ThreadShare } from "../share-access";

export const SHARE_FAILURE_TEXT = "Something went wrong. Try again.";
export const PRIVATE_HINT_TEXT = "Only signed-in workspace members can open it.";

interface SharePanelProps {
  threadId: string;
  share: ThreadShare | null;
  canManage: boolean;
  webUrl: string;
}

export function SharePanel({ threadId, share, canManage, webUrl }: SharePanelProps) {
  const groupName = useId();
  const [current, setCurrent] = useState(share);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const privateUrl = `${webUrl}/t/${threadId}`;
  if (!canManage) {
    return (
      <section className={`${DASH_CARD_CLASS} flex flex-col gap-4 p-4`}>
        <CopyLink label="Thread link" value={privateUrl} />
      </section>
    );
  }

  async function enable() {
    setPending(true);
    setError(null);
    const { data, error: rpcError } = await getSupabaseBrowserClient().rpc("thread_share_enable", {
      p_thread_id: threadId,
    });
    setPending(false);
    if (rpcError !== null) {
      setError(SHARE_FAILURE_TEXT);
      return;
    }
    const row = data[0];
    if (row === undefined) {
      setError(SHARE_FAILURE_TEXT);
      return;
    }
    setCurrent({ token: row.token, expiresAt: row.expires_at });
  }

  async function disable() {
    setPending(true);
    setError(null);
    const { error: rpcError } = await getSupabaseBrowserClient().rpc("thread_share_disable", {
      p_thread_id: threadId,
    });
    setPending(false);
    if (rpcError !== null) {
      setError(SHARE_FAILURE_TEXT);
      return;
    }
    setCurrent(null);
  }

  return (
    <section className={`${DASH_CARD_CLASS} flex flex-col gap-4 p-4`}>
      <h2 className="text-base font-semibold text-neutral-900">Access</h2>
      <fieldset disabled={pending} className="flex flex-col gap-3">
        <legend className="sr-only">Who can open this thread</legend>
        <label className="flex items-center gap-2 text-sm text-neutral-800">
          <input
            type="radio"
            name={groupName}
            checked={current === null}
            onChange={() => {
              void disable();
            }}
          />
          Private — workspace members only
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-800">
          <input
            type="radio"
            name={groupName}
            checked={current !== null}
            onChange={() => {
              void enable();
            }}
          />
          Anyone with the link
        </label>
      </fieldset>
      {current === null ? (
        <div className="flex flex-col gap-3">
          <CopyLink label="Thread link" value={privateUrl} />
          <p className="text-sm text-neutral-600">{PRIVATE_HINT_TEXT}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <CopyLink label="Shared link" value={`${webUrl}/s/${current.token}`} />
          <p className="text-sm text-neutral-600">
            Expires on{" "}
            {new Date(current.expiresAt).toLocaleDateString("en-GB", {
              timeZone: "UTC",
              year: "numeric",
              month: "short",
              day: "numeric",
            })}{" "}
            (UTC)
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              void enable();
            }}
            className={`${DASH_BUTTON_SECONDARY_CLASS} w-fit`}
          >
            Extend 30 days
          </button>
        </div>
      )}
      {error === null ? null : (
        <p role="alert" className={DASH_ERROR_CLASS}>
          {error}
        </p>
      )}
    </section>
  );
}
