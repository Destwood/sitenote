import { describe, expect, it } from "vitest";

import { pagePathLabel } from ".";

describe("pagePathLabel", () => {
  it("shows the path and the query without the origin", () => {
    expect(pagePathLabel("https://example.test/pricing/team?plan=pro")).toBe(
      "/pricing/team?plan=pro",
    );
  });

  it("shows the root path for a bare origin", () => {
    expect(pagePathLabel("https://example.test")).toBe("/");
  });

  it("returns the input unchanged when it is not a URL", () => {
    expect(pagePathLabel("not a url")).toBe("not a url");
  });
});
