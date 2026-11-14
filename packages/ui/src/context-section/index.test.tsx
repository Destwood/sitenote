import {
  stepsToPlaywright,
  type ConsoleErrorRecord,
  type RecordingStep,
  type ThreadContext,
} from "@sitenote/core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CONTEXT_UNAVAILABLE_TEXT,
  ContextSection,
  formatDuration,
  formatSizeMb,
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

describe("ContextSection recording", () => {
  const recording = { path: "ws/thread.webm", durationMs: 65_000, size: 1_572_864 };

  it("shows no recording block when the context has no recording", () => {
    render(
      <ContextSection
        context={context()}
        hasScreenshot={false}
        recording={{ status: "ready", url: "https://x.test/r.webm" }}
      />,
    );

    expect(screen.queryByLabelText("Screen recording")).toBeNull();
    expect(screen.queryByText("Loading video...")).toBeNull();
  });

  it("shows a loading state while the recording url is requested", () => {
    const { rerender } = render(
      <ContextSection context={context({ recording })} hasScreenshot={false} />,
    );
    expect(screen.getByRole("status").textContent).toBe("Loading video...");

    rerender(
      <ContextSection
        context={context({ recording })}
        hasScreenshot={false}
        recording={{ status: "loading" }}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("Loading video...");
  });

  it("plays the signed recording with controls and a duration and size caption", () => {
    render(
      <ContextSection
        context={context({ recording })}
        hasScreenshot={false}
        recording={{ status: "ready", url: "https://x.test/r.webm?token=1" }}
      />,
    );

    const video = screen.getByLabelText("Screen recording");
    expect(video.tagName).toBe("VIDEO");
    expect(video.hasAttribute("controls")).toBe(true);
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(video.getAttribute("src")).toBe("https://x.test/r.webm?token=1");
    expect(screen.getByText("1:05 · 1.5 MB")).toBeTruthy();
  });

  it("reports an unavailable recording and refuses unsafe urls", () => {
    const { rerender } = render(
      <ContextSection
        context={context({ recording })}
        hasScreenshot={false}
        recording={{ status: "unavailable" }}
      />,
    );
    expect(screen.getByText("Video could not be loaded.")).toBeTruthy();

    rerender(
      <ContextSection
        context={context({ recording })}
        hasScreenshot={false}
        recording={{ status: "ready", url: "javascript:alert(1)" }}
      />,
    );
    expect(screen.getByText("Video could not be loaded.")).toBeTruthy();
    expect(screen.queryByLabelText("Screen recording")).toBeNull();
  });
});

describe("recording formatters", () => {
  it("formats the duration as minutes and seconds", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(9_400)).toBe("0:09");
    expect(formatDuration(59_600)).toBe("1:00");
    expect(formatDuration(125_000)).toBe("2:05");
  });

  it("formats the size in megabytes", () => {
    expect(formatSizeMb(0)).toBe("0.0 MB");
    expect(formatSizeMb(1_572_864)).toBe("1.5 MB");
  });
});

describe("ContextSection recording steps", () => {
  const steps: RecordingStep[] = [
    { t: 0, kind: "click", selector: "#buy", label: "Buy now" },
    { t: 4_200, kind: "input", selector: "#email", label: "" },
    { t: 9_000, kind: "submit", selector: "form", label: "Checkout" },
    { t: 65_000, kind: "navigate", selector: "body", label: "", url: "/thanks" },
  ];
  const recording = { path: "ws/thread.webm", durationMs: 65_000, size: 1_572_864, steps };

  function stubClipboard(clipboard: { writeText: ReturnType<typeof vi.fn> } | undefined) {
    Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
  }

  afterEach(() => {
    Reflect.deleteProperty(navigator, "clipboard");
    vi.useRealTimers();
  });

  function openStepsTab() {
    fireEvent.click(screen.getByRole("tab", { name: /^Steps/ }));
  }

  it("counts and lists user actions while hiding navigation", () => {
    render(<ContextSection context={context({ recording })} hasScreenshot={false} />);
    openStepsTab();

    expect(screen.getByRole("tab", { name: "Steps (3)" })).toBeTruthy();
    const list = screen.getByRole("list", { name: "What the reporter did (3)" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "0:00ClickBuy now",
      "0:04Field changed#email",
      "0:09Form submittedCheckout",
    ]);
  });

  it("falls back to the selector without a label", () => {
    render(<ContextSection context={context({ recording })} hasScreenshot={false} />);
    openStepsTab();

    expect(screen.getByText("#email")).toBeTruthy();
  });

  it("keeps the full text of a step in its title", () => {
    render(<ContextSection context={context({ recording })} hasScreenshot={false} />);
    openStepsTab();

    expect(screen.getByTitle("Buy now").textContent).toBe("Buy now");
  });

  it("renders step text as plain text", () => {
    const { container } = render(
      <ContextSection
        context={context({
          recording: {
            ...recording,
            steps: [{ t: 0, kind: "click", selector: "a", label: "<img src=x onerror=alert(1)>" }],
          },
        })}
        hasScreenshot={false}
      />,
    );
    openStepsTab();

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });

  it("says no steps were recorded when the recording only has navigation", () => {
    render(
      <ContextSection
        context={context({
          recording: { ...recording, steps: steps.filter((step) => step.kind === "navigate") },
        })}
        hasScreenshot={false}
      />,
    );
    openStepsTab();

    expect(screen.getByText("No steps were recorded for this video.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy as Playwright" })).toBeNull();
  });

  it("copies the Playwright script of the page and the steps", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText });
    render(
      <ContextSection
        context={context({ url: "https://example.com/pricing", recording })}
        hasScreenshot={false}
      />,
    );
    openStepsTab();

    fireEvent.click(screen.getByRole("button", { name: "Copy as Playwright" }));

    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(stepsToPlaywright("https://example.com/pricing", steps));
    expect(writeText.mock.calls[0]?.[0]).toContain('await page.locator("#buy").click();');
    expect(writeText.mock.calls[0]?.[0]).toContain('await page.waitForURL("**/thanks");');
  });

  it("returns to the copy label two seconds after copying", async () => {
    vi.useFakeTimers();
    stubClipboard({ writeText: vi.fn().mockResolvedValue(undefined) });
    render(<ContextSection context={context({ recording })} hasScreenshot={false} />);
    openStepsTab();

    fireEvent.click(screen.getByRole("button", { name: "Copy as Playwright" }));
    await act(() => Promise.resolve());
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1_999);
    });
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("button", { name: "Copy as Playwright" })).toBeTruthy();
  });

  it("says the copy failed when the clipboard rejects", async () => {
    stubClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    render(<ContextSection context={context({ recording })} hasScreenshot={false} />);
    openStepsTab();

    fireEvent.click(screen.getByRole("button", { name: "Copy as Playwright" }));

    expect(await screen.findByRole("button", { name: "Copy failed" })).toBeTruthy();
  });

  it("says the copy failed when the clipboard API is missing", async () => {
    stubClipboard(undefined);
    render(<ContextSection context={context({ recording })} hasScreenshot={false} />);
    openStepsTab();

    fireEvent.click(screen.getByRole("button", { name: "Copy as Playwright" }));

    expect(await screen.findByRole("button", { name: "Copy failed" })).toBeTruthy();
  });

  it("shows the replay button only when a replay handler is passed", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ContextSection context={context({ recording })} hasScreenshot={false} />,
    );
    openStepsTab();
    expect(screen.queryByRole("button", { name: /Reproduce/ })).toBeNull();

    const onReplaySteps = vi.fn();
    rerender(
      <ContextSection
        context={context({ recording })}
        hasScreenshot={false}
        onReplaySteps={onReplaySteps}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Reproduce/ }));

    expect(onReplaySteps).toHaveBeenCalledTimes(1);
  });
});

describe("ContextSection network errors", () => {
  it("lists the failed requests with their method, url, status and time", () => {
    render(
      <ContextSection
        context={context({
          networkErrors: [
            {
              kind: "fetch",
              method: "POST",
              url: "https://api.example.com/orders",
              status: 500,
              at: AT,
            },
            { kind: "xhr", method: "GET", url: "https://api.example.com/cart", status: 0 },
          ],
        })}
        hasScreenshot={false}
      />,
    );

    expect(screen.getByText("Failed requests (2)").tagName).toBe("SUMMARY");
    expect(screen.getByText("https://api.example.com/orders")).toBeTruthy();
    expect(screen.getByText("POST")).toBeTruthy();
    expect(screen.getByText("500")).toBeTruthy();
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByText("09:30:00 UTC")).toBeTruthy();
  });

  it("shows no failed requests block when the list is missing or empty", () => {
    const { rerender } = render(<ContextSection context={context()} hasScreenshot={false} />);
    expect(screen.queryByText(/Failed requests/)).toBeNull();

    rerender(<ContextSection context={context({ networkErrors: [] })} hasScreenshot={false} />);
    expect(screen.queryByText(/Failed requests/)).toBeNull();
  });
});

describe("ContextSection copy context", () => {
  it("hides the copy button when no copy handler is passed", () => {
    render(<ContextSection context={context()} hasScreenshot={false} />);

    expect(screen.queryByRole("button", { name: "Copy context" })).toBeNull();
  });

  it("says copied when the handler succeeds", async () => {
    const onCopyContext = vi.fn().mockResolvedValue(true);
    render(
      <ContextSection context={context()} hasScreenshot={false} onCopyContext={onCopyContext} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy context" }));

    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(onCopyContext).toHaveBeenCalledTimes(1);
  });

  it("says it could not copy when the handler returns false", async () => {
    render(
      <ContextSection
        context={context()}
        hasScreenshot={false}
        onCopyContext={vi.fn().mockReturnValue(false)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy context" }));

    expect(await screen.findByRole("button", { name: "Could not copy" })).toBeTruthy();
  });

  it("says it could not copy when the handler throws", async () => {
    render(
      <ContextSection
        context={context()}
        hasScreenshot={false}
        onCopyContext={vi.fn().mockRejectedValue(new Error("denied"))}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy context" }));

    expect(await screen.findByRole("button", { name: "Could not copy" })).toBeTruthy();
  });
});
