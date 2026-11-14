import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReplayBar, type ReplayBarProps, type ReplayBarStatus } from ".";

function renderBar(overrides: Partial<ReplayBarProps> = {}) {
  const handlers = {
    onBack: vi.fn(),
    onNext: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onSkip: vi.fn(),
    onRetry: vi.fn(),
    onStop: vi.fn(),
  };
  render(
    <ReplayBar
      mode="auto"
      index={0}
      total={3}
      status="running"
      label="Clicking the header"
      {...handlers}
      {...overrides}
    />,
  );
}

describe("ReplayBar", () => {
  it("shows a spinner before the label while preparing the replay", () => {
    renderBar({ status: "waiting", label: "Preparing replay…" });

    const spinner = screen.getByTestId("replay-spinner");

    expect(spinner.getAttribute("aria-hidden")).toBe("true");
    expect(spinner.parentElement?.textContent).toBe("Preparing replay…");
  });

  it.each<ReplayBarStatus>(["ready", "running", "input", "missing", "done"])(
    "shows no spinner for status %s",
    (status) => {
      renderBar({ status });

      expect(screen.queryByTestId("replay-spinner")).toBeNull();
    },
  );
});
