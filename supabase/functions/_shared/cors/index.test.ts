import { describe, expect, it } from "vitest";

import { corsHeaders } from ".";

describe("corsHeaders", () => {
  it("allows only the origin of the site url", () => {
    const headers = corsHeaders("https://app.sitenote.test/some/path");
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://app.sitenote.test");
    expect(headers.Vary).toBe("Origin");
  });

  it("throws for a value that is not an url", () => {
    expect(() => corsHeaders("not a url")).toThrow();
  });
});
