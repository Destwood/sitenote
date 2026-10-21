import { describe, expect, it } from "vitest";

import { Z_INDEX } from ".";

describe("Z_INDEX", () => {
  it("keeps every layer distinct, ascending and below the 32-bit maximum", () => {
    const values = Object.values(Z_INDEX);

    expect(new Set(values).size).toBe(values.length);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(Math.max(...values)).toBeLessThan(2147483647);
  });

  it("stacks pins below the panel and the panel below toasts", () => {
    expect(Z_INDEX.pins).toBeLessThan(Z_INDEX.panel);
    expect(Z_INDEX.panel).toBeLessThan(Z_INDEX.toast);
  });
});
