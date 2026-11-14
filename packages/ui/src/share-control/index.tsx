import { useEffect, useState } from "react";

import { FOCUS_RING, SECONDARY_BUTTON } from "../control-classes";

export type ShareAccess = "workspace" | "link";

export interface ThreadShareControl {
  access: ShareAccess;
  pending: boolean;
  onAccessChange: (access: ShareAccess) => void;
  onCopy: () => Promise<boolean> | boolean;
}

const COPY_FEEDBACK_MS = 2000;

const SHARE_LABELS = {
  idle: "Share",
  copied: "Copied",
  failed: "Could not copy",
} as const;

export function ShareControl({ access, pending, onAccessChange, onCopy }: ThreadShareControl) {
  const [copyState, setCopyState] = useState<keyof typeof SHARE_LABELS>("idle");

  useEffect(() => {
    if (copyState === "idle") {
      return;
    }
    const timer = setTimeout(() => {
      setCopyState("idle");
    }, COPY_FEEDBACK_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [copyState]);

  async function copyLink() {
    try {
      setCopyState((await onCopy()) ? "copied" : "failed");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div role="status" className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => {
          void copyLink();
        }}
        className={`${SECONDARY_BUTTON} gap-1`}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        {SHARE_LABELS[copyState]}
      </button>
      <select
        aria-label="Who can open the link"
        value={access}
        disabled={pending}
        onChange={(event) => {
          onAccessChange(event.target.value === "link" ? "link" : "workspace");
        }}
        className={`max-w-[132px] rounded-md border border-neutral-300 bg-white px-1.5 py-1.5 text-xs text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
      >
        <option value="workspace">Workspace members</option>
        <option value="link">Anyone with the link</option>
      </select>
    </div>
  );
}
