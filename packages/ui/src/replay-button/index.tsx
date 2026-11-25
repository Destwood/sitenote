import { REPLAY_MODES, type ReplayMode } from "@sitenote/core";
import { useState } from "react";

import { SplitButton } from "../split-button";

export const REPLAY_MODE_LABELS: Readonly<Record<ReplayMode, string>> = {
  step: "Step by step",
  auto: "Autoplay",
};

const OPTIONS = REPLAY_MODES.map((value) => ({ value, label: REPLAY_MODE_LABELS[value] }));

export interface ReplayButtonProps {
  onReplay: (mode: ReplayMode) => void;
  label?: string;
  className?: string;
}

export function ReplayButton({ onReplay, label = "Replay on page", className }: ReplayButtonProps) {
  const [mode, setMode] = useState<ReplayMode>("step");

  return (
    <SplitButton
      value={mode}
      options={OPTIONS}
      onAction={() => {
        onReplay(mode);
      }}
      onSelect={(next) => {
        setMode(next);
        onReplay(next);
      }}
      chooseLabel="Choose replay mode"
      menuLabel="Replay mode"
      className={className ?? ""}
    >
      {label}
      <span className="ml-1 font-normal text-neutral-600">{REPLAY_MODE_LABELS[mode]}</span>
    </SplitButton>
  );
}
