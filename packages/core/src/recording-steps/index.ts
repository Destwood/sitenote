import type { RecordingStep } from "../context";

export type RecordedAction = RecordingStep & { kind: Exclude<RecordingStep["kind"], "navigate"> };

export function isRecordedAction(step: RecordingStep): step is RecordedAction {
  return step.kind !== "navigate";
}

const LINE_BREAKS = /[\r\n\u2028\u2029]/g;

function commentLines(label: string): string[] {
  return label === "" ? [] : [`  // ${label.replace(LINE_BREAKS, " ")}`];
}

function stepLines(step: RecordingStep): string[] {
  const locator = `page.locator(${JSON.stringify(step.selector)})`;
  const comment = commentLines(step.label);
  switch (step.kind) {
    case "click":
      return [...comment, `  await ${locator}.click();`];
    case "input":
      return [...comment, "  // TODO: enter a value", `  await ${locator}.fill("");`];
    case "submit":
      return [...comment, `  await ${locator}.press("Enter");`];
    case "navigate":
      return [...comment, `  await page.waitForURL(${JSON.stringify(`**${step.url ?? ""}`)});`];
  }
}

export function stepsToPlaywright(startUrl: string, steps: readonly RecordingStep[]): string {
  const lines = [
    'import { test } from "@playwright/test";',
    'test("reproduce", async ({ page }) => {',
    `  await page.goto(${JSON.stringify(startUrl)});`,
    ...steps.flatMap(stepLines),
    "});",
  ];
  return `${lines.join("\n")}\n`;
}
