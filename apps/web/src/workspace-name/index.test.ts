import { describe, expect, it } from "vitest";

import { parseWorkspaceName, WORKSPACE_NAME_MAX_LENGTH } from ".";

describe("parseWorkspaceName", () => {
  it("trims surrounding whitespace", () => {
    expect(parseWorkspaceName("  Northwind Studio \n")).toBe("Northwind Studio");
  });

  it("accepts one character and the maximum length", () => {
    expect(parseWorkspaceName("a")).toBe("a");
    const longest = "a".repeat(WORKSPACE_NAME_MAX_LENGTH);
    expect(parseWorkspaceName(longest)).toBe(longest);
  });

  it("rejects empty and whitespace-only names", () => {
    expect(parseWorkspaceName("")).toBeNull();
    expect(parseWorkspaceName("   \t\n")).toBeNull();
  });

  it("rejects names longer than the maximum after trimming", () => {
    expect(parseWorkspaceName("a".repeat(WORKSPACE_NAME_MAX_LENGTH + 1))).toBeNull();
    expect(parseWorkspaceName(`  ${"a".repeat(WORKSPACE_NAME_MAX_LENGTH)}  `)).toBe(
      "a".repeat(WORKSPACE_NAME_MAX_LENGTH),
    );
  });

  it("rejects values that are not strings", () => {
    expect(parseWorkspaceName(null)).toBeNull();
    expect(parseWorkspaceName(undefined)).toBeNull();
    expect(parseWorkspaceName(42)).toBeNull();
    expect(parseWorkspaceName(new File([], "x"))).toBeNull();
  });
});
