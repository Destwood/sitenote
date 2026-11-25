import { describe, expect, it } from "vitest";

import type { RecordingStep } from "../context";
import { isRecordedAction, stepsToPlaywright } from ".";

const START = "https://example.test/pricing?plan=pro";
const HEADER = [
  'import { test } from "@playwright/test";',
  'test("reproduce", async ({ page }) => {',
  `  await page.goto(${JSON.stringify(START)});`,
];

function statements(script: string): string[] {
  return script.split("\n").slice(HEADER.length, -2);
}

describe("stepsToPlaywright", () => {
  it.each([
    ["back", "goBack"],
    ["forward", "goForward"],
    ["reload", "reload"],
  ] as const)("exports %s without a locator or comment", (kind, method) => {
    const step: RecordingStep = { t: 0, kind, selector: "", label: "" };
    expect(isRecordedAction(step)).toBe(true);
    expect(statements(stepsToPlaywright(START, [step]))).toEqual([`  await page.${method}();`]);
  });

  it("writes a test that only opens the start page when there are no steps", () => {
    expect(stepsToPlaywright(START, [])).toBe(`${[...HEADER, "});"].join("\n")}\n`);
  });

  it("writes one statement per step kind", () => {
    const steps: RecordingStep[] = [
      { t: 1, kind: "click", selector: "#buy", label: "Buy" },
      { t: 2, kind: "input", selector: "input[name=email]", label: "Email" },
      { t: 3, kind: "submit", selector: "form.checkout", label: "Checkout" },
      { t: 4, kind: "navigate", selector: "body", label: "", url: "/cart" },
    ];

    expect(stepsToPlaywright(START, steps).split("\n")).toEqual([
      ...HEADER,
      "  // Buy",
      '  await page.locator("#buy").filter({ hasText: "Buy" }).first().click();',
      "  // Email",
      "  // TODO: enter a value",
      '  await page.locator("input[name=email]").filter({ hasText: "Email" }).first().fill("");',
      "  // Checkout",
      '  await page.locator("form.checkout").filter({ hasText: "Checkout" }).first().press("Enter");',
      '  await page.waitForURL("**/cart");',
      "});",
      "",
    ]);
  });

  it("waits for the url of a navigation step with the pattern of any origin", () => {
    expect(
      statements(
        stepsToPlaywright(START, [{ t: 1, kind: "navigate", selector: "a", label: "", url: "/x" }]),
      ),
    ).toEqual(['  await page.waitForURL("**/x");']);
    expect(
      statements(stepsToPlaywright(START, [{ t: 1, kind: "navigate", selector: "a", label: "" }])),
    ).toEqual(['  await page.waitForURL("**");']);
  });

  it("escapes quotes, backticks and template markers in selectors and urls", () => {
    const selector = 'a"b`c${d}\\e';
    const url = '/q?x="`${y}"';
    const script = stepsToPlaywright(START, [
      { t: 1, kind: "click", selector, label: "" },
      { t: 2, kind: "navigate", selector: "a", label: "", url },
    ]);

    expect(statements(script)).toEqual([
      `  await page.locator(${JSON.stringify(selector)}).first().click();`,
      `  await page.waitForURL(${JSON.stringify(`**${url}`)});`,
    ]);
  });

  it("keeps a selector that tries to break out of the string inside the string", () => {
    const selector = '"); alert(1); ("';
    expect(
      statements(stepsToPlaywright(START, [{ t: 1, kind: "click", selector, label: "" }])),
    ).toEqual([`  await page.locator(${JSON.stringify(selector)}).first().click();`]);
  });

  it("writes the label as a one-line comment with line breaks and separators removed", () => {
    const script = stepsToPlaywright(START, [
      { t: 1, kind: "click", selector: "a", label: "Save\nthen\r\u2028evil" },
    ]);

    expect(statements(script)).toEqual([
      "  // Save then  evil",
      '  await page.locator("a").filter({ hasText: "Save\\nthen\\r\u2028evil" }).first().click();',
    ]);
  });

  it("keeps a comment terminator inside a label as plain comment text", () => {
    const script = stepsToPlaywright(START, [
      { t: 1, kind: "click", selector: "a", label: "end */ ' \" `" },
    ]);

    expect(statements(script)[0]).toBe("  // end */ ' \" `");
  });

  it("uses the first selector match for every action with an empty label", () => {
    const steps: RecordingStep[] = [
      { t: 1, kind: "click", selector: "button", label: "" },
      { t: 2, kind: "input", selector: "input", label: "" },
      { t: 3, kind: "submit", selector: "form", label: "" },
    ];

    expect(statements(stepsToPlaywright(START, steps))).toEqual([
      '  await page.locator("button").first().click();',
      "  // TODO: enter a value",
      '  await page.locator("input").first().fill("");',
      '  await page.locator("form").first().press("Enter");',
    ]);
  });

  it("JSON-escapes quotes, newlines and backslashes in the text filter", () => {
    const label = 'Open "C:\\files"\nnow';

    expect(
      statements(stepsToPlaywright(START, [{ t: 1, kind: "click", selector: "a", label }])),
    ).toEqual([
      '  // Open "C:\\files" now',
      '  await page.locator("a").filter({ hasText: "Open \\"C:\\\\files\\"\\nnow" }).first().click();',
    ]);
  });

  it("leaves sensitive input values empty with the TODO intact", () => {
    expect(
      statements(
        stepsToPlaywright(START, [
          { t: 1, kind: "input", selector: "#password", label: "Password", sensitive: true },
        ]),
      ),
    ).toEqual([
      "  // Password",
      "  // TODO: enter a value",
      '  await page.locator("#password").filter({ hasText: "Password" }).first().fill("");',
    ]);
  });

  it("indents every statement by two spaces", () => {
    const script = stepsToPlaywright(START, [
      { t: 1, kind: "click", selector: "a", label: "x" },
      { t: 2, kind: "input", selector: "b", label: "" },
    ]);

    for (const line of statements(script)) {
      expect(line.startsWith("  ")).toBe(true);
    }
  });

  it("escapes the start url", () => {
    const url = 'https://example.test/"quoted"`tick`';
    expect(stepsToPlaywright(url, []).split("\n")[2]).toBe(
      `  await page.goto(${JSON.stringify(url)});`,
    );
  });
});
