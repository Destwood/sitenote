import { useEffect, useId, useState } from "react";

import { ERROR_CLASS, INPUT_CLASS } from "../form-controls";
import { sendMessage } from "../message-client";
import { type SelectionPlacement } from "../messages";
import { ERROR_MESSAGES, type ErrorCode } from "@sitenote/widget";

export function SelectionPlacementControl() {
  const selectId = useId();
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
    <div className="flex flex-col gap-2">
      <label htmlFor={selectId} className="text-sm font-semibold text-neutral-900">
        Comment button
      </label>
      <select
        id={selectId}
        value={placement}
        onChange={(event) => {
          void handleChange(event.target.value === "above" ? "above" : "below");
        }}
        className={INPUT_CLASS}
      >
        <option value="below">Below selection</option>
        <option value="above">Above selection</option>
      </select>
      {error === null ? null : (
        <p role="alert" className={ERROR_CLASS}>
          {ERROR_MESSAGES[error]}
        </p>
      )}
    </div>
  );
}
