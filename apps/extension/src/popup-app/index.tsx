import { useCallback, useEffect, useState } from "react";

import { ERROR_CLASS, SECONDARY_BUTTON_CLASS } from "../form-controls";
import { onAuthStateChanged, sendMessage } from "../message-client";
import { type AuthState } from "../messages";
import { ERROR_MESSAGES, type ErrorCode } from "@sitenote/widget";
import { SignInPanel } from "../sign-in-panel";
import { SignedInView } from "../signed-in-view";

type View =
  { kind: "loading" } | { kind: "error"; code: ErrorCode } | { kind: "ready"; state: AuthState };

interface PopupAppProps {
  googleEnabled: boolean;
  webUrl: string;
}

async function fetchView(): Promise<View> {
  const result = await sendMessage({ type: "auth.getState" });
  return result.ok
    ? { kind: "ready", state: result.data }
    : { kind: "error", code: result.error.code };
}

export function PopupApp({ googleEnabled, webUrl }: PopupAppProps) {
  const [view, setView] = useState<View>({ kind: "loading" });

  const showState = useCallback((state: AuthState) => {
    setView({ kind: "ready", state });
  }, []);

  const retry = useCallback(() => {
    setView({ kind: "loading" });
    void fetchView().then(setView);
  }, []);

  useEffect(() => {
    let active = true;
    void fetchView().then((next) => {
      if (active) {
        setView(next);
      }
    });
    const unsubscribe = onAuthStateChanged(showState);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [showState]);

  return (
    <main className="flex w-[340px] flex-col gap-4 bg-white p-4 text-neutral-900">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex size-6 items-center justify-center rounded-md bg-neutral-900 text-xs font-bold text-white"
        >
          S
        </span>
        <h1 className="text-base font-bold tracking-tight">Sitenote</h1>
      </div>
      {view.kind === "loading" ? (
        <p role="status" className="text-sm text-neutral-600">
          Loading...
        </p>
      ) : null}
      {view.kind === "error" ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className={ERROR_CLASS}>
            {ERROR_MESSAGES[view.code]}
          </p>
          <button type="button" onClick={retry} className={SECONDARY_BUTTON_CLASS}>
            Try again
          </button>
        </div>
      ) : null}
      {view.kind === "ready" && view.state.status === "signedOut" ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-neutral-600">
            Leave comments directly on any website and review them with your team.
          </p>
          <SignInPanel googleEnabled={googleEnabled} webUrl={webUrl} onSignedIn={showState} />
        </div>
      ) : null}
      {view.kind === "ready" && view.state.status === "signedIn" ? (
        <SignedInView user={view.state.user} webUrl={webUrl} onSignedOut={showState} />
      ) : null}
    </main>
  );
}
