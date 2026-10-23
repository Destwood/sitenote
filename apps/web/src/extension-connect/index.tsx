"use client";

import { useState } from "react";

import { connectExtension, type ExtensionConnection } from "../extension-connection";
import { InstallInstructions } from "../extension-install";
import { ERROR_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "../form-controls";

type View = { status: "idle" } | { status: "connecting" } | ExtensionConnection;

interface ExtensionConnectProps {
  extensionId: string;
}

export function ExtensionConnect({ extensionId }: ExtensionConnectProps) {
  const [view, setView] = useState<View>({ status: "idle" });

  async function connect() {
    setView({ status: "connecting" });
    setView(await connectExtension(extensionId));
  }

  switch (view.status) {
    case "idle":
      return (
        <button
          type="button"
          onClick={() => void connect()}
          className={`${PRIMARY_BUTTON_CLASS} w-fit`}
        >
          Connect the extension
        </button>
      );
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
            The extension is connected. You can close this tab.
          </p>
          {view.webCopyCleared ? null : (
            <p className="text-sm text-neutral-600">
              This browser still holds a copy of your web session. Close this tab and do not sign in
              to the web app with it.
            </p>
          )}
        </div>
      );
    case "missing":
      return (
        <div className="flex flex-col gap-3">
          <InstallInstructions lead="The Sitenote extension was not found in this browser. Install it, then connect." />
          <button
            type="button"
            onClick={() => void connect()}
            className={`${PRIMARY_BUTTON_CLASS} w-fit`}
          >
            I installed it — connect
          </button>
        </div>
      );
    case "alreadySignedIn":
      return (
        <div className="flex flex-col gap-3">
          <p role="alert" className={ERROR_CLASS}>
            The extension is signed in as another account. Sign out in the extension popup first,
            then connect again.
          </p>
          <button
            type="button"
            onClick={() => void connect()}
            className={`${SECONDARY_BUTTON_CLASS} w-fit`}
          >
            Connect again
          </button>
        </div>
      );
    case "failed":
      return (
        <div className="flex flex-col gap-3">
          <p role="alert" className={ERROR_CLASS}>
            The extension could not accept this session. Try connecting again.
          </p>
          <button
            type="button"
            onClick={() => void connect()}
            className={`${SECONDARY_BUTTON_CLASS} w-fit`}
          >
            Try connecting again
          </button>
        </div>
      );
  }
}
