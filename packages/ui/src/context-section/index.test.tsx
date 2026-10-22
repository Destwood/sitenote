import type { ConsoleErrorRecord, ThreadContext } from "@sitenote/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  CONTEXT_UNAVAILABLE_TEXT,
  ContextSection,
  formatSystem,
  formatViewport,
  safeScreenshotUrl,
} from ".";

const AT = "2026-10-22T09:30:00.000Z";

function context(overrides: Partial<ThreadContext> = {}): ThreadContext {
  return {
    viewport: { width: 1440, height: 900 },
    devicePixelRatio: 2,
    pageTitle: "Northwind Studio",
    url: "https://example.com/?a=1",
    browser: { name: "Chrome", version: "130.0.6723.92" },
    os: { name: "macOS", version: "14.5" },
    userAgent: "Mozilla/5.0",
    consoleErrors: [],
    capturedAt: AT,
    ...overrides,
  };
}

function record(overrides: Partial<ConsoleErrorRecord> = {}): ConsoleErrorRecord {
  return { kind: "error", message: "Boom", at: AT, ...overrides };
}

describe("helpers", () => {
  it("formats the viewport with the device pixel ratio", () => {
    expect(formatViewport(context())).toBe("1440×900 @2x");
    expect(formatViewport(context({ devicePixelRatio: 1.25 }))).toBe("1440×900 @1.25x");
    expect(formatViewport(context({ devicePixelRatio: 1.5 }))).toBe("1440×900 @1.5x");
    expect(formatViewport(context({ devicePixelRatio: 1.3333333 }))).toBe("1440×900 @1.33x");
  });

  it("joins a system name and its version", () => {
    expect(formatSystem("Chrome", "130")).toBe("Chrome 130");
    expect(formatSystem("Linux", undefined)).toBe("Linux");
    expect(formatSystem("Unknown", "")).toBe("Unknown");
  });

  it("accepts only http and https screenshot urls", () => {
    expect(safeScreenshotUrl("https://x.test/a.webp?token=1")).toBe(
      "https://x.test/a.webp?token=1",
    );
    expect(safeScreenshotUrl("http://127.0.0.1:54321/a")).toBe("http://127.0.0.1:54321/a");
    expect(safeScreenshotUrl("javascript:alert(1)")).toBeNull();
    expect(safeScreenshotUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(safeScreenshotUrl("not a url")).toBeNull();
  });
});

describe("ContextSection details", () => {
  it("shows the viewport, browser, system and page title", () => {
    render(<ContextSection context={context()} hasScreenshot={false} />);

    const section = screen.getByRole("region", { name: "Page context" });
    expect(within(section).getByText("1440×900 @2x")).toBeTruthy();
    expect(within(section).getByText("Chrome 130.0.6723.92")).toBeTruthy();
    expect(within(section).getByText("macOS 14.5")).toBeTruthy();
    expect(within(section).getByText("Northwind Studio")).toBeTruthy();
  });

  it("names an empty page title", () => {
    render(<ContextSection context={context({ pageTitle: "" })} hasScreenshot={false} />);

    expect(screen.getByText("Untitled")).toBeTruthy();
  });

  it("says that the context is unavailable instead of failing", () => {
    render(<ContextSection context={null} hasScreenshot={false} />);

    expect(screen.getByText(CONTEXT_UNAVAILABLE_TEXT)).toBeTruthy();
    expect(screen.queryByText("Viewport")).toBeNull();
  });

  it("renders the page title and messages as text only", () => {
    const { container } = render(
      <ContextSection
        context={context({
          pageTitle: "<img src=x onerror=alert(1)>",
          consoleErrors: [record({ message: "<script>alert(1)</script>" })],
        })}
        hasScreenshot={false}
      />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
    expect(screen.getByText("<script>alert(1)</script>")).toBeTruthy();
  });
});

describe("ContextSection console errors", () => {
  it("says there are none when the list is empty", () => {
    render(<ContextSection context={context()} hasScreenshot={false} />);

    expect(screen.getByText("No console errors.")).toBeTruthy();
    expect(screen.queryByText(/Console errors \(/)).toBeNull();
  });

  it("lists the errors under a collapsible summary with their count", () => {
    render(
      <ContextSection
        context={context({
          consoleErrors: [
            record({
              message: "Uncaught Error: boom",
              source: "https://example.com/app.js",
              line: 12,
              column: 4,
              stack: "Error: boom\n    at run (app.js:12:4)",
            }),
            record({ kind: "unhandledrejection", message: "Uncaught (in promise) nope" }),
            record({ kind: "console.error", message: "clicked" }),
          ],
        })}
        hasScreenshot={false}
      />,
    );

    const summary = screen.getByText("Console errors (3)");
    expect(summary.tagName).toBe("SUMMARY");
    expect(summary.closest("details")?.hasAttribute("open")).toBe(false);
    expect(screen.getAllByRole("listitem", { hidden: true })).toHaveLength(3);
    expect(screen.getByText("Uncaught Error: boom")).toBeTruthy();
    expect(screen.getByText("https://example.com/app.js:12:4")).toBeTruthy();
    expect(screen.getByText("Uncaught error")).toBeTruthy();
    expect(screen.getByText("Unhandled rejection")).toBeTruthy();
    expect(screen.getAllByText("console.error")).toHaveLength(1);
  });

  it("opens the list and the stack on demand", async () => {
    const user = userEvent.setup();
    render(
      <ContextSection
        context={context({ consoleErrors: [record({ stack: "at run (app.js:1:1)" })] })}
        hasScreenshot={false}
      />,
    );

    await user.click(screen.getByText("Console errors (1)"));
    const stackSummary = screen.getByText("Stack");
    expect(stackSummary.closest("details")?.hasAttribute("open")).toBe(false);
    await user.click(stackSummary);

    expect(stackSummary.closest("details")?.hasAttribute("open")).toBe(true);
    expect(screen.getByText("at run (app.js:1:1)")).toBeTruthy();
  });

  it("shows a source without a line and no location without a source", () => {
    render(
      <ContextSection
        context={context({
          consoleErrors: [
            record({ source: "https://example.com/a.js" }),
            record({ message: "second", line: 7 }),
          ],
        })}
        hasScreenshot={false}
      />,
    );

    expect(screen.getByText("https://example.com/a.js")).toBeTruthy();
    expect(screen.queryByText(/:7/)).toBeNull();
  });
});

describe("ContextSection screenshot", () => {
  it("says there is no screenshot when the thread has none", () => {
    render(<ContextSection context={context()} hasScreenshot={false} screenshot={undefined} />);

    expect(screen.getByText("No screenshot saved.")).toBeTruthy();
  });

  it("shows a loading state while the url is requested", () => {
    const { rerender } = render(<ContextSection context={context()} hasScreenshot />);
    expect(screen.getByRole("status").textContent).toContain("Loading screenshot");

    rerender(
      <ContextSection context={context()} hasScreenshot screenshot={{ status: "loading" }} />,
    );
    expect(screen.getByRole("status").textContent).toContain("Loading screenshot");
  });

  it("links the thumbnail to the full image in a new tab", () => {
    render(
      <ContextSection
        context={context()}
        hasScreenshot
        screenshot={{ status: "ready", url: "https://x.test/s.webp?token=1" }}
      />,
    );

    const link = screen.getByRole("link", { name: "Open the full screenshot in a new tab" });
    expect(link.getAttribute("href")).toBe("https://x.test/s.webp?token=1");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    const image = within(link).getByRole("img", { name: "Screenshot of the commented area" });
    expect(image.getAttribute("src")).toBe("https://x.test/s.webp?token=1");
    expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("falls back to a text link when the image cannot be displayed", () => {
    render(
      <ContextSection
        context={context()}
        hasScreenshot
        screenshot={{ status: "ready", url: "https://x.test/s.webp" }}
      />,
    );

    fireEvent.error(screen.getByRole("img"));

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("link").textContent).toContain("Open screenshot");
  });

  it("reports an unavailable screenshot and refuses unsafe urls", () => {
    const { rerender } = render(
      <ContextSection context={context()} hasScreenshot screenshot={{ status: "unavailable" }} />,
    );
    expect(screen.getByText("Screenshot could not be loaded.")).toBeTruthy();

    rerender(
      <ContextSection
        context={context()}
        hasScreenshot
        screenshot={{ status: "ready", url: "javascript:alert(1)" }}
      />,
    );
    expect(screen.getByText("Screenshot could not be loaded.")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
