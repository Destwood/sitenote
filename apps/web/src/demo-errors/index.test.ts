import { describe, expect, it } from "vitest";

import { mapDemoError } from ".";

describe("mapDemoError", () => {
  it.each([
    [{ code: "P0001", message: "demo_rate_limited" }, "demo_limited"],
    [{ code: "42501", message: "permission denied" }, "forbidden"],
    [{ code: "PGRST116", message: "no rows" }, "not_found"],
    [{ code: "23514", message: "check violated" }, "validation"],
    [{ code: "22023", message: "invalid" }, "validation"],
    [{ code: "PGRST301", message: "JWT expired" }, "unauthorized"],
    [{ code: "P0001", message: "something else" }, "unknown"],
    [new TypeError("Failed to fetch"), "network"],
    [{ code: "", message: "Failed to fetch" }, "network"],
    [null, "unknown"],
  ])("maps %j", (error, expected) => {
    expect(mapDemoError(error)).toBe(expected);
  });
});
