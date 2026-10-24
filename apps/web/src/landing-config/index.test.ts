import { describe, expect, it } from "vitest";

import { githubUrlFrom } from ".";

describe("githubUrlFrom", () => {
  it("returns an http or https URL unchanged", () => {
    expect(githubUrlFrom("https://github.com/example/sitenote")).toBe(
      "https://github.com/example/sitenote",
    );
  });

  it("hides the link when the variable is missing, empty or not a web URL", () => {
    expect(githubUrlFrom(undefined)).toBeNull();
    expect(githubUrlFrom("")).toBeNull();
    expect(githubUrlFrom("github.com/example/sitenote")).toBeNull();
    expect(githubUrlFrom("javascript:alert(1)")).toBeNull();
  });
});
