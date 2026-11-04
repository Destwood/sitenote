"use client";

import { useState } from "react";

import {
  DASH_BUTTON_SECONDARY_CLASS,
  DASH_INPUT_CLASS,
  DASH_LABEL_CLASS,
} from "../dashboard-classes";

type CopyState = "idle" | "copied" | "failed";

export const LINK_COPIED_TEXT = "Link copied.";
export const COPY_BLOCKED_TEXT =
  "Copying is blocked in this browser. Copy the link from the field.";

interface CopyLinkProps {
  label: string;
  value: string;
}

export function CopyLink({ label, value }: CopyLinkProps) {
  const [state, setState] = useState<CopyState>("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className={DASH_LABEL_CLASS}>
        {label}
        <input
          type="text"
          readOnly
          value={value}
          onFocus={(event) => {
            event.currentTarget.select();
          }}
          className={DASH_INPUT_CLASS}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void copy()} className={DASH_BUTTON_SECONDARY_CLASS}>
          Copy link
        </button>
        {state === "copied" ? (
          <p role="status" className="text-sm text-neutral-700">
            {LINK_COPIED_TEXT}
          </p>
        ) : null}
        {state === "failed" ? (
          <p role="status" className="text-sm text-neutral-700">
            {COPY_BLOCKED_TEXT}
          </p>
        ) : null}
      </div>
    </div>
  );
}
