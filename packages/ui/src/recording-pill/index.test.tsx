import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Z_INDEX } from "../z-index";
import { RecordingPill } from ".";

const STARTED_AT = 1_000_000;
const MAX_MS = 120_000;

describe("RecordingPill", () => {
  let current: number;
  const now = () => current;

  beforeEach(() => {
    vi.useFakeTimers();
    current = STARTED_AT;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the elapsed time as m:ss and keeps counting every second", () => {
    render(<RecordingPill startedAt={STARTED_AT} maxMs={MAX_MS} onStop={vi.fn()} now={now} />);

    expect(screen.getByText("0:00")).toBeTruthy();

    act(() => {
      current = STARTED_AT + 75_400;
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText("1:15")).toBeTruthy();
  });

  it("stops the timer at the maximum length", () => {
    render(<RecordingPill startedAt={STARTED_AT} maxMs={MAX_MS} onStop={vi.fn()} now={now} />);

    act(() => {
      current = STARTED_AT + 999_000;
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText("2:00")).toBeTruthy();
  });

  it("calls onStop from the stop button", () => {
    const onStop = vi.fn();
    render(<RecordingPill startedAt={STARTED_AT} maxMs={MAX_MS} onStop={onStop} now={now} />);

    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("is a fixed banner above the page", () => {
    render(<RecordingPill startedAt={STARTED_AT} maxMs={MAX_MS} onStop={vi.fn()} now={now} />);

    const pill = screen.getByRole("group", { name: "Screen recording" });

    expect(pill.className).toContain("fixed");
    expect(pill.style.zIndex).toBe(String(Z_INDEX.banner));
  });
});
