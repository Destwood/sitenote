import { describe, expect, it } from "vitest";

import { parseUuid } from ".";

describe("parseUuid", () => {
  it("accepts a uuid", () => {
    expect(parseUuid("10000000-0000-4000-8000-000000000001")).toBe(
      "10000000-0000-4000-8000-000000000001",
    );
  });

  it.each(["", "not-a-uuid", "10000000-0000-4000-8000-00000000000", null, undefined, 1])(
    "rejects %j",
    (value) => {
      expect(parseUuid(value)).toBeNull();
    },
  );
});
