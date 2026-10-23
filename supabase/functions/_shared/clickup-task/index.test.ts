import { describe, expect, it } from "vitest";

import { buildTaskDescription, buildTaskName, decideTaskCreation } from "./index.ts";

const context = {
  viewport: "1280 x 720",
  devicePixelRatio: 2,
  browser: "Chrome 130",
  os: "Windows 11",
  errorCount: 3,
};

describe("buildTaskName", () => {
  it("uses the first comment on one line, cut to 80 characters", () => {
    expect(buildTaskName("  Button\n  is   misaligned  ")).toBe("Button is misaligned");
    const long = "a".repeat(120);
    const name = buildTaskName(long);
    expect(Array.from(name)).toHaveLength(80);
    expect(name.endsWith("…")).toBe(true);
  });

  it("falls back to a fixed name without comment text", () => {
    expect(buildTaskName(null)).toBe("Sitenote comment");
    expect(buildTaskName("   ")).toBe("Sitenote comment");
  });
});

describe("buildTaskDescription", () => {
  it("contains the page, the quoted comment, the context and the deep link", () => {
    const description = buildTaskDescription({
      pageUrl: "https://example.com/pricing",
      firstComment: "Price is wrong\nsecond line",
      context,
      deepLink: "https://app.sitenote.test/t/abc",
    });
    expect(description).toBe(
      [
        "**Page:** https://example.com/pricing",
        "",
        "**Comment:**",
        "> Price is wrong",
        "> second line",
        "",
        "**Context:**",
        "- Viewport: 1280 x 720 at 2x",
        "- Browser: Chrome 130",
        "- System: Windows 11",
        "- Console errors: 3",
        "",
        "**Open in Sitenote:** https://app.sitenote.test/t/abc",
      ].join("\n"),
    );
  });

  it("escapes markup in the comment so it cannot add links or headings", () => {
    const description = buildTaskDescription({
      pageUrl: "https://example.com/",
      firstComment: "[click](https://evil.test) # heading",
      context: null,
      deepLink: "https://app.sitenote.test/t/abc",
    });
    expect(description).toContain("> \\[click\\](https://evil.test) \\# heading");
    expect(description).not.toContain("Context");
  });

  it("states when there is no comment text", () => {
    const description = buildTaskDescription({
      pageUrl: "https://example.com/",
      firstComment: null,
      context: null,
      deepLink: "https://app.sitenote.test/t/abc",
    });
    expect(description).toContain("_No comment text_");
  });
});

describe("decideTaskCreation", () => {
  it("returns the existing task when the thread already has one", () => {
    expect(
      decideTaskCreation({
        clickUpTaskId: "86abc",
        clickUpTaskUrl: "https://app.clickup.com/t/86abc",
      }),
    ).toEqual({ kind: "existing", taskId: "86abc", taskUrl: "https://app.clickup.com/t/86abc" });
  });

  it("creates a task when the thread has none or only half of one", () => {
    expect(decideTaskCreation({ clickUpTaskId: null, clickUpTaskUrl: null })).toEqual({
      kind: "create",
    });
    expect(decideTaskCreation({ clickUpTaskId: "86abc", clickUpTaskUrl: null })).toEqual({
      kind: "create",
    });
  });
});
