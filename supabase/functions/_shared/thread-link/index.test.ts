import { describe, expect, it } from "vitest";

import { threadLink } from ".";

describe("threadLink", () => {
  it("builds the thread page on the site origin", () => {
    expect(threadLink("https://app.sitenote.test/", "10000000-0000-4000-8000-000000000001")).toBe(
      "https://app.sitenote.test/t/10000000-0000-4000-8000-000000000001",
    );
  });

  it("drops the path of the site url", () => {
    expect(threadLink("http://127.0.0.1:3000/app", "abc")).toBe("http://127.0.0.1:3000/t/abc");
  });
});
