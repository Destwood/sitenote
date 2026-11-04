"use client";

import Link from "next/link";
import { useState } from "react";

import { connectMemberExtension, type ExtensionConnection } from "../extension-connection";
import { InstallInstructions } from "../extension-install";
import {
  PUBLIC_ERROR_CLASS,
  PUBLIC_PRIMARY_BUTTON_CLASS,
  PUBLIC_SECONDARY_BUTTON_CLASS,
} from "../public-styles";

type View = { status: "idle" } | { status: "connecting" } | ExtensionConnection;

interface ExtensionConnectProps {
  extensionId: string;
}

export function ExtensionConnect({ extensionId }: ExtensionConnectProps) {
  const [view, setView] = useState<View>({ status: "idle" });

  async function connect() {
    setView({ status: "connecting" });
    setView(await connectMemberExtension(extensionId));
  }

  switch (view.status) {
    case "idle":
      return (
        <button
          type="button"
          onClick={() => void connect()}
          className={`${PUBLIC_PRIMARY_BUTTON_CLASS} w-fit`}
        >
          Connect the extension
        </button>
      );
    case "connecting":
      return (
        <p role="status" className="text-sm text-neutral-700">
          Connecting the Sitenote extension...
        </p>
      );
    case "connected":
      return (
        <div className="flex flex-col gap-4">
          <span className="flex size-10 items-center justify-center rounded-full bg-green-100 text-green-700">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m5 12 4 4L19 6" />
            </svg>
          </span>
          <p role="status" data-testid="extension-connected" className="font-medium">
            The extension is connected. You are still signed in here.
          </p>
          <Link href="/app" className={`${PUBLIC_PRIMARY_BUTTON_CLASS} w-fit`}>
            Open dashboard
          </Link>
        </div>
      );
    case "missing":
      return (
        <div className="flex flex-col gap-3">
          <InstallInstructions lead="The Sitenote extension was not found in this browser. Install it, then connect." />
          <button
            type="button"
            onClick={() => void connect()}
            className={`${PUBLIC_PRIMARY_BUTTON_CLASS} w-fit`}
          >
            I installed it — connect
          </button>
        </div>
      );
    case "alreadySignedIn":
      return (
        <div className="flex flex-col gap-3">
          <p role="alert" className={PUBLIC_ERROR_CLASS}>
            The extension is signed in as another account. Sign out in the extension popup first,
            then connect again.
          </p>
          <button
            type="button"
            onClick={() => void connect()}
            className={`${PUBLIC_SECONDARY_BUTTON_CLASS} w-fit`}
          >
            Connect again
          </button>
        </div>
      );
    case "failed":
      return (
        <div className="flex flex-col gap-3">
          <p role="alert" className={PUBLIC_ERROR_CLASS}>
            The extension could not accept this session. Try connecting again.
          </p>
          <button
            type="button"
            onClick={() => void connect()}
            className={`${PUBLIC_SECONDARY_BUTTON_CLASS} w-fit`}
          >
            Try connecting again
          </button>
        </div>
      );
  }
}
