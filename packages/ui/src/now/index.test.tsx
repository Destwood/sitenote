import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NOW_REFRESH_MS, useNow } from ".";

afterEach(() => {
  vi.useRealTimers();
});

describe("useNow", () => {
  it("returns the current time and refreshes on the interval", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T12:00:00.000Z"));
    const { result } = renderHook(() => useNow());
    const first = result.current;

    expect(first).toBe(Date.parse("2026-10-21T12:00:00.000Z"));

    act(() => {
      vi.advanceTimersByTime(NOW_REFRESH_MS);
    });

    expect(result.current).toBe(first + NOW_REFRESH_MS);
  });

  it("stops its timer on unmount", () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useNow(1000));

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
