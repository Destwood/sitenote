import { escapeMarkdown, firstCodePoints, singleLine } from "../markup/index.ts";
import type { ThreadContextSummary } from "../thread-context/index.ts";

export const TASK_NAME_MAX = 80;

export interface TaskDescriptionInput {
  pageUrl: string;
  firstComment: string | null;
  context: ThreadContextSummary | null;
  deepLink: string;
}

export type TaskDecision =
  { kind: "existing"; taskId: string; taskUrl: string } | { kind: "create" };

export function buildTaskName(firstComment: string | null): string {
  const text = singleLine(firstComment ?? "");
  return text.length === 0 ? "Sitenote comment" : firstCodePoints(text, TASK_NAME_MAX);
}

export function buildTaskDescription(input: TaskDescriptionInput): string {
  const comment = input.firstComment?.trim() ?? "";
  const commentLines =
    comment.length === 0
      ? ["_No comment text_"]
      : comment.split(/\r?\n/).map((line) => `> ${escapeMarkdown(line)}`);
  const lines = [`**Page:** ${escapeMarkdown(input.pageUrl)}`, "", "**Comment:**", ...commentLines];
  if (input.context !== null) {
    lines.push(
      "",
      "**Context:**",
      `- Viewport: ${escapeMarkdown(input.context.viewport)} at ${String(input.context.devicePixelRatio)}x`,
      `- Browser: ${escapeMarkdown(input.context.browser)}`,
      `- System: ${escapeMarkdown(input.context.os)}`,
      `- Console errors: ${String(input.context.errorCount)}`,
    );
  }
  lines.push("", `**Open in Sitenote:** ${escapeMarkdown(input.deepLink)}`);
  return lines.join("\n");
}

export function decideTaskCreation(thread: {
  clickUpTaskId: string | null;
  clickUpTaskUrl: string | null;
}): TaskDecision {
  const { clickUpTaskId: taskId, clickUpTaskUrl: taskUrl } = thread;
  if (taskId !== null && taskUrl !== null) {
    return { kind: "existing", taskId, taskUrl };
  }
  return { kind: "create" };
}
