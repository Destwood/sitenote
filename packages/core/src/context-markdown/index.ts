import type { Anchor } from "../anchoring";
import type {
  ConsoleErrorRecord,
  NetworkErrorRecord,
  RecordingRef,
  RecordingStep,
  ThreadContext,
} from "../context";

export const CONTEXT_MARKDOWN_MAX = 12000;
const STACK_MAX = 600;
const TRUNCATED_SUFFIX = "\n\n…truncated";

export interface ThreadContextMarkdownInput {
  excerpt: string;
  authorName?: string | undefined;
  status?: "open" | "resolved" | undefined;
  threadUrl?: string | undefined;
  pageUrl: string;
  context: ThreadContext | null;
  anchor?: Anchor | null | undefined;
}

function isPresent(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

function keepLines(lines: readonly (string | null)[]): string[] {
  return lines.filter((line): line is string => line !== null);
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function longestBacktickRun(value: string): number {
  return Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));
}

function inlineCode(value: string): string {
  const fence = "`".repeat(longestBacktickRun(value) + 1);
  const pad = value.startsWith("`") || value.endsWith("`") ? " " : "";
  return `${fence}${pad}${value}${pad}${fence}`;
}

function cell(value: string): string {
  return oneLine(value).replaceAll("|", "\\|");
}

function utcTime(at: string): string {
  return `${new Date(at).toISOString().slice(11, 19)} UTC`;
}

function named(name: string, version: string | undefined): string {
  return isPresent(version) ? `${name} ${version}` : name;
}

function block(heading: string, lines: readonly string[]): string {
  return lines.length === 0 ? "" : [`### ${heading}`, ...lines].join("\n");
}

function bugReportBlock({
  excerpt,
  authorName,
  status,
  threadUrl,
}: ThreadContextMarkdownInput): string {
  const title = (excerpt.split(/\r?\n/)[0] ?? "").trim();
  const meta = keepLines([
    status === undefined ? null : `Status: ${status}`,
    isPresent(authorName) ? `Author: ${authorName}` : null,
  ]);
  const lines = keepLines([
    title === "" ? null : `**${title}**`,
    meta.length === 0 ? null : meta.join(" · "),
    isPresent(threadUrl) ? `Thread: ${threadUrl}` : null,
  ]);
  return lines.length === 0 ? "" : ["## Bug report", ...lines].join("\n");
}

function pageBlock(pageUrl: string, context: ThreadContext | null): string {
  const url = context === null || context.url === "" ? pageUrl : context.url;
  const lines = [`URL: ${url}`];
  if (context !== null) {
    if (context.pageTitle !== "") {
      lines.push(`Title: ${oneLine(context.pageTitle)}`);
    }
    lines.push(`Captured: ${context.capturedAt}`);
  }
  return block("Page", lines);
}

function environmentBlock(context: ThreadContext | null): string {
  if (context === null) {
    return "";
  }
  const { viewport, devicePixelRatio, browser, os } = context;
  return block("Environment", [
    `Browser: ${named(browser.name, browser.version)}`,
    `OS: ${named(os.name, os.version)}`,
    `Viewport: ${String(viewport.width)}x${String(viewport.height)} @ ${String(Number(devicePixelRatio.toFixed(2)))}x`,
  ]);
}

function elementBlock(anchor: Anchor | null | undefined): string {
  if (anchor === undefined || anchor === null) {
    return "";
  }
  const selector = anchor.kind === "element" ? anchor.selectors.css : "";
  const text = oneLine(anchor.kind === "element" ? anchor.fingerprint.text : anchor.quote.exact);
  return block(
    "Element",
    keepLines([
      selector === "" ? null : `Selector: ${inlineCode(selector)}`,
      text === "" ? null : `Text: ${text}`,
    ]),
  );
}

function stepText(step: RecordingStep): string {
  const label = oneLine(step.label);
  const quoted = label === "" ? "" : ` "${label}"`;
  const sensitive = step.sensitive === true;
  switch (step.kind) {
    case "click":
      return sensitive || step.selector === ""
        ? `click${quoted}`
        : `click${quoted} (${inlineCode(step.selector)})`;
    case "input":
      return `Type into${quoted === "" ? " a field" : quoted} (value not recorded)`;
    case "submit":
      return `submit${quoted === "" ? " form" : quoted}`;
    case "navigate":
      return sensitive || !isPresent(step.url)
        ? `Go to${quoted === "" ? " page" : quoted}`
        : `Go to ${oneLine(step.url)}`;
  }
}

function stepsBlock(recording: RecordingRef | undefined): string {
  if (recording === undefined) {
    return "";
  }
  const list = (recording.steps ?? []).map(
    (step, index) => `${String(index + 1)}. ${stepText(step)}`,
  );
  const extras = keepLines([
    recording.startsSignedOut === true ? "Starts signed out: yes" : null,
    isPresent(recording.startUrl) ? `Recording started at: ${recording.startUrl}` : null,
  ]);
  const separator = list.length > 0 && extras.length > 0 ? [""] : [];
  return block("Steps to reproduce", [...list, ...separator, ...extras]);
}

function networkRow(record: NetworkErrorRecord): string {
  const time = record.at === undefined ? "-" : utcTime(record.at);
  const status = record.status === 0 ? "failed" : String(record.status);
  return `| ${time} | ${cell(record.method)} | ${cell(record.url)} | ${status} |`;
}

function networkBlock(records: readonly NetworkErrorRecord[]): string {
  if (records.length === 0) {
    return "";
  }
  return block("Failed network requests", [
    "| Time | Method | URL | Status |",
    "| --- | --- | --- | --- |",
    ...records.map(networkRow),
  ]);
}

function stackLines(stack: string): string[] {
  const clipped = stack.slice(0, STACK_MAX);
  const fence = "`".repeat(Math.max(3, longestBacktickRun(clipped) + 1));
  const body = clipped.split(/\r?\n/).map((line) => `  ${line}`);
  return [`  ${fence}`, ...body, `  ${fence}`];
}

function consoleEntry(record: ConsoleErrorRecord): string[] {
  const stamp = record.at === undefined ? "" : `[${utcTime(record.at)}] `;
  const head = `- ${stamp}${record.kind}: ${oneLine(record.message)}`;
  return isPresent(record.stack) ? [head, ...stackLines(record.stack)] : [head];
}

function consoleBlock(records: readonly ConsoleErrorRecord[]): string {
  return block("Console errors", records.flatMap(consoleEntry));
}

function render(
  lead: readonly string[],
  network: readonly NetworkErrorRecord[],
  consoleErrors: readonly ConsoleErrorRecord[],
): string {
  return [...lead, networkBlock(network), consoleBlock(consoleErrors)]
    .filter((part) => part !== "")
    .join("\n\n");
}

function fit(
  lead: readonly string[],
  network: readonly NetworkErrorRecord[],
  consoleErrors: readonly ConsoleErrorRecord[],
): string {
  let kept = { network, consoleErrors };
  let dropped = false;
  let text = render(lead, kept.network, kept.consoleErrors);
  while (
    text.length + (dropped ? TRUNCATED_SUFFIX.length : 0) > CONTEXT_MARKDOWN_MAX &&
    (kept.consoleErrors.length > 0 || kept.network.length > 0)
  ) {
    dropped = true;
    kept =
      kept.consoleErrors.length > 0
        ? { network: kept.network, consoleErrors: kept.consoleErrors.slice(1) }
        : { network: kept.network.slice(1), consoleErrors: kept.consoleErrors };
    text = render(lead, kept.network, kept.consoleErrors);
  }
  if (!dropped && text.length <= CONTEXT_MARKDOWN_MAX) {
    return text;
  }
  const fits = text.length + TRUNCATED_SUFFIX.length <= CONTEXT_MARKDOWN_MAX;
  return `${fits ? text : text.slice(0, CONTEXT_MARKDOWN_MAX - TRUNCATED_SUFFIX.length)}${TRUNCATED_SUFFIX}`;
}

export function formatThreadContextMarkdown(input: ThreadContextMarkdownInput): string {
  const { context } = input;
  const lead = [
    bugReportBlock(input),
    pageBlock(input.pageUrl, context),
    environmentBlock(context),
    elementBlock(input.anchor),
    stepsBlock(context?.recording),
  ];
  return fit(lead, context?.networkErrors ?? [], context?.consoleErrors ?? []);
}
