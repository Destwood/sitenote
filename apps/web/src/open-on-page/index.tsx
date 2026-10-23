"use client";

import { appendThreadHash } from "@sitenote/core";
import { useEffect, useState } from "react";

import { pingExtension } from "../extension-bridge";
import { InstallInstructions } from "../extension-install";
import { LINK_BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from "../form-controls";

type ExtensionPresence = "checking" | "present" | "absent";

interface OpenOnPageProps {
  pageUrl: string;
  threadId: string;
  extensionId: string;
}

export function OpenOnPage({ pageUrl, threadId, extensionId }: OpenOnPageProps) {
  const [presence, setPresence] = useState<ExtensionPresence>("checking");

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
        <button type="button" onClick={openOnPage} className={`${PRIMARY_BUTTON_CLASS} w-fit`}>
          Open on page
        </button>
      );
    case "absent":
      return (
        <div className="flex flex-col gap-4">
          <InstallInstructions lead="Install the Sitenote extension to open this comment on its page." />
          <a
            href={pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${LINK_BUTTON_CLASS} w-fit`}
          >
            Open page
          </a>
        </div>
      );
  }
}
