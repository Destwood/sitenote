import { useCallback, useEffect, useState } from "react";

import { AccountPanel } from "../account-panel";
import { ERROR_CLASS, SECONDARY_BUTTON_CLASS } from "../form-controls";
import { onAuthStateChanged, sendMessage } from "../message-client";
import { AUTH_ERROR_MESSAGES, type AuthErrorCode, type AuthState } from "../messages";
import { SignInPanel } from "../sign-in-panel";

type View =
  | { kind: "loading" }
  | { kind: "error"; code: AuthErrorCode }
  | { kind: "ready"; state: AuthState };

interface PopupAppProps {
  googleEnabled: boolean;
}

async function fetchView(): Promise<View> {
  const result = await sendMessage({ type: "auth.getState" });
  return result.ok
    ? { kind: "ready", state: result.data }
    : { kind: "error", code: result.error.code };
}

export function PopupApp({ googleEnabled }: PopupAppProps) {
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
      <h1 className="text-base font-bold tracking-tight">Sitenote</h1>
      {view.kind === "loading" ? (
        <p role="status" className="text-sm text-neutral-600">
          Loading...
        </p>
      ) : null}
      {view.kind === "error" ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className={ERROR_CLASS}>
            {AUTH_ERROR_MESSAGES[view.code]}
          </p>
          <button type="button" onClick={retry} className={SECONDARY_BUTTON_CLASS}>
            Try again
          </button>
        </div>
      ) : null}
      {view.kind === "ready" && view.state.status === "signedOut" ? (
        <SignInPanel googleEnabled={googleEnabled} onSignedIn={showState} />
      ) : null}
      {view.kind === "ready" && view.state.status === "signedIn" ? (
        <AccountPanel user={view.state.user} onSignedOut={showState} />
      ) : null}
    </main>
  );
}
