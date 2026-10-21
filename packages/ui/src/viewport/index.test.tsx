import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useViewport } from ".";

const initial = { width: window.innerWidth, height: window.innerHeight };

afterEach(() => {
  window.innerWidth = initial.width;
  window.innerHeight = initial.height;
});

describe("useViewport", () => {
  it("returns the window size and follows resize events", () => {
    const { result } = renderHook(() => useViewport());

    expect(result.current).toEqual(initial);

    act(() => {
      window.innerWidth = 500;
      window.innerHeight = 400;
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current).toEqual({ width: 500, height: 400 });
  });

  it("stops listening after unmount", () => {
    const { result, unmount } = renderHook(() => useViewport());
    unmount();

    window.innerWidth = 123;
    window.dispatchEvent(new Event("resize"));

    expect(result.current).toEqual(initial);
  });
});
