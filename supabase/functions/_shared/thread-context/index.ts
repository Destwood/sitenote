import * as z from "zod/mini";

const contextSchema = z.object({
  viewport: z.object({ width: z.number(), height: z.number() }),
  devicePixelRatio: z.number(),
  browser: z.object({ name: z.string(), version: z.string() }),
  os: z.object({ name: z.string(), version: z.optional(z.string()) }),
  consoleErrors: z.array(z.unknown()),
});

export interface ThreadContextSummary {
  viewport: string;
  devicePixelRatio: number;
  browser: string;
  os: string;
  errorCount: number;
}

export function summarizeThreadContext(value: unknown): ThreadContextSummary | null {
  const result = z.safeParse(contextSchema, value);
  if (!result.success) {
    return null;
  }
  const { viewport, devicePixelRatio, browser, os, consoleErrors } = result.data;
  const osVersion = os.version === undefined ? "" : ` ${os.version}`;
  return {
    viewport: `${String(viewport.width)} x ${String(viewport.height)}`,
    devicePixelRatio,
    browser: `${browser.name} ${browser.version}`.trim(),
    os: `${os.name}${osVersion}`.trim(),
    errorCount: consoleErrors.length,
  };
}
