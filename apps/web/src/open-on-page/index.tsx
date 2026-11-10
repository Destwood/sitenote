"use client";

import { appendThreadHash } from "@sitenote/core";
import { ReplayButton } from "@sitenote/ui";
import { useEffect, useState } from "react";

import { pingExtension } from "../extension-bridge";
import { InstallInstructions } from "../extension-install";
import { LINK_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from "../form-controls";
import { safeExternalHref } from "../safe-external-link";

type ExtensionPresence = "checking" | "present" | "absent";

interface OpenOnPageProps {
  pageUrl: string;
  startUrl?: string | undefined;
  threadId: string;
  extensionId: string;
  hasSteps: boolean;
}

export function OpenOnPage({
  pageUrl,
  startUrl,
  threadId,
  extensionId,
  hasSteps,
}: OpenOnPageProps) {
  const [presence, setPresence] = useState<ExtensionPresence>("checking");
  const replayUrl = (startUrl === undefined ? null : safeExternalHref(startUrl)) ?? pageUrl;

  useEffect(() => {
    let current = true;
    void pingExtension(extensionId).then((result) => {
      if (current) {
        setPresence(result.status === "ok" ? "present" : "absent");
      }
    });
    return () => {
      current = false;
    };
  }, [extensionId]);

  function openOnPage() {
    const target = appendThreadHash(pageUrl, threadId);
    if (target !== null) {
      window.open(target, "_blank", "noopener");
    }
  }

  switch (presence) {
    case "checking":
      return (
        <p role="status" className="text-sm text-neutral-700">
          Checking for the Sitenote extension...
        </p>
      );
    case "present":
      return (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={openOnPage} className={`${PRIMARY_BUTTON_CLASS} w-fit`}>
            Open on page
          </button>
          {hasSteps ? (
            <ReplayButton
              label="Reproduce"
              onReplay={(mode) => {
                window.open(
                  appendThreadHash(replayUrl, threadId, mode) ?? replayUrl,
                  "_blank",
                  "noopener",
                );
              }}
            />
          ) : null}
        </div>
      );
    case "absent":
      return (
        <div className="flex flex-col gap-4">
          <InstallInstructions lead="Install the Sitenote extension to open this comment on its page." />
          <a
            href={replayUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${LINK_BUTTON_CLASS} w-fit`}
          >
            Open the page where this was recorded
          </a>
        </div>
      );
  }
}
