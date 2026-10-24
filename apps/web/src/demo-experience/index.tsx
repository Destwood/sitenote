"use client";

import { Z_INDEX } from "@sitenote/ui";
import { mountWidget, type WidgetHandle } from "@sitenote/widget";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SubmitEvent as FormSubmitEvent,
} from "react";

import { createDemoBackend } from "../demo-backend";
import { getDemoSupabaseClient } from "../demo-client";
import { createDemoScreenshots } from "../demo-screenshot";
import {
  DEMO_NAME_MAX_LENGTH,
  enterSite,
  parseDemoName,
  readVisitorName,
  startVisit,
} from "../demo-session";
import {
  ERROR_CLASS,
  INPUT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from "../form-controls";

const BANNER_MESSAGE = "Live demo — anyone can comment. Everything resets daily.";
const SESSION_ERROR = "We could not start the demo. Try again.";
const BANNER_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-60";
const NAME_ERROR = `Enter a name of 1 to ${String(DEMO_NAME_MAX_LENGTH)} characters.`;

async function readSavedVisit(): Promise<string | null> {
  try {
    return await readVisitorName(getDemoSupabaseClient());
  } catch {
    return null;
  }
}

async function connectVisit(host: HTMLElement, name: string): Promise<WidgetHandle> {
  const client = getDemoSupabaseClient();
  await startVisit(client, name);
  await enterSite(client, window.location.origin);
  return mountWidget({
    host,
    document,
    window,
    backend: createDemoBackend({
      client,
      win: window,
      doc: document,
      screenshots: createDemoScreenshots({ win: window, doc: document }),
    }),
  });
}

interface DemoExperienceProps {
  children: ReactNode;
}

export function DemoExperience({ children }: DemoExperienceProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<WidgetHandle | null>(null);
  const activeRef = useRef(false);
  const [checking, setChecking] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const isMounted = () => activeRef.current;

  useEffect(() => {
    activeRef.current = true;
    const host = hostRef.current;
    async function resume() {
      if (host === null) {
        return;
      }
      const saved = await readSavedVisit();
      if (!isMounted()) {
        return;
      }
      if (saved === null) {
        setChecking(false);
        return;
      }
      try {
        const handle = await connectVisit(host, saved);
        if (!isMounted()) {
          handle.unmount();
          return;
        }
        handleRef.current = handle;
      } catch {
        if (isMounted()) {
          setBannerError(SESSION_ERROR);
        }
      } finally {
        if (isMounted()) {
          setChecking(false);
        }
      }
    }
    void resume();
    return () => {
      activeRef.current = false;
      handleRef.current?.unmount();
      handleRef.current = null;
    };
  }, []);

  function startCommenting() {
    setBannerError(null);
    if (handleRef.current !== null) {
      handleRef.current.setCommentMode(true);
      return;
    }
    setError(null);
    setDialogOpen(true);
  }

  async function submitName(event: FormSubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const displayName = parseDemoName(name);
    if (displayName === null) {
      setError(NAME_ERROR);
      return;
    }
    const host = hostRef.current;
    if (busy || host === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const handle = await connectVisit(host, displayName);
      if (!isMounted()) {
        handle.unmount();
        return;
      }
      handle.setCommentMode(true);
      handleRef.current = handle;
      setDialogOpen(false);
    } catch {
      setError(SESSION_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-900 px-6 py-3 text-white">
        <p className="text-sm font-medium">{BANNER_MESSAGE}</p>
        <button
          type="button"
          onClick={startCommenting}
          disabled={checking}
          className={BANNER_BUTTON_CLASS}
        >
          Start commenting
        </button>
        {bannerError === null ? null : (
          <p role="alert" className={`${ERROR_CLASS} w-full`}>
            {bannerError}
          </p>
        )}
      </div>
      {children}
      <div ref={hostRef} />
      {dialogOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="demo-name-heading"
          className="fixed inset-0 flex items-center justify-center bg-neutral-900/40 p-4"
          style={{ zIndex: Z_INDEX.panel }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setDialogOpen(false);
            }
          }}
        >
          <form
            onSubmit={(event) => void submitName(event)}
            className="flex w-full max-w-sm flex-col gap-4 rounded-lg bg-white p-6 shadow-lg"
          >
            <h2 id="demo-name-heading" className="text-lg font-semibold">
              Choose the name your comments show
            </h2>
            <p className="text-sm text-neutral-600">
              No account needed. Other visitors see this name next to your comments.
            </p>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="demo-name" className="text-sm font-medium text-neutral-700">
                Your name
              </label>
              <input
                id="demo-name"
                name="name"
                type="text"
                autoComplete="name"
                autoFocus
                maxLength={DEMO_NAME_MAX_LENGTH}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                aria-invalid={error !== null}
                aria-describedby={error === null ? undefined : "demo-name-error"}
                className={INPUT_CLASS}
              />
            </div>
            {error === null ? null : (
              <p id="demo-name-error" role="alert" className={ERROR_CLASS}>
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy} className={PRIMARY_BUTTON_CLASS}>
                {busy ? "Starting..." : "Start commenting"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDialogOpen(false);
                }}
                className={SECONDARY_BUTTON_CLASS}
              >
                Not now
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
