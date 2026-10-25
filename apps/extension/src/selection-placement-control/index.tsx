import { useEffect, useState } from "react";

import { sendMessage } from "../message-client";
import { type SelectionPlacement } from "../messages";
import { ERROR_MESSAGES, type ErrorCode } from "@sitenote/widget";

const ABOVE_HINT = "Show the Comment button above selected text";

export function SelectionPlacementControl() {
  const [placement, setPlacement] = useState<SelectionPlacement>("below");
  const [error, setError] = useState<ErrorCode | null>(null);

  useEffect(() => {
    let active = true;
    void sendMessage({ type: "preferences.getSelectionPlacement" }).then((result) => {
      if (active && result.ok) {
        setPlacement(result.data);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleChange(next: SelectionPlacement) {
    const previous = placement;
    setPlacement(next);
    setError(null);
    const result = await sendMessage({
      type: "preferences.setSelectionPlacement",
      placement: next,
    });
    if (!result.ok) {
      setPlacement(previous);
      setError(result.error.code);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <label title={ABOVE_HINT} className="flex items-center gap-1 text-xs text-neutral-600">
        <input
          type="checkbox"
          checked={placement === "above"}
          onChange={(event) => {
            void handleChange(event.target.checked ? "above" : "below");
          }}
          className="size-4 accent-neutral-900"
        />
        Button above
      </label>
      {error === null ? null : (
        <p role="alert" className="text-xs text-red-800">
          {ERROR_MESSAGES[error]}
        </p>
      )}
    </div>
  );
}
