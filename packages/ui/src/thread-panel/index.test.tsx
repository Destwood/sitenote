import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PANEL_SURFACE } from "../control-classes";
import { VIEWPORT_MARGIN } from "../placement";
import { BOB, makeComment, makeThread } from "../test-fixtures";
import type { ThreadView } from "../types";
import { Z_INDEX } from "../z-index";
import { PANEL_WIDTH, ThreadPanel, type ThreadPanelProps } from ".";

const ANCHOR = { x: 100, y: 100, width: 24, height: 24 };
const initial = { width: window.innerWidth, height: window.innerHeight };

function renderPanel(props: Partial<ThreadPanelProps> = {}) {
  const handlers = {
    onSubmit: vi.fn().mockResolvedValue(undefined),
    onEditComment: vi.fn().mockResolvedValue(undefined),
    onDeleteComment: vi.fn().mockResolvedValue(undefined),
    onToggleStatus: vi.fn(),
    onClose: vi.fn(),
  };
  const result = render(
    <ThreadPanel
      thread={makeThread()}
      anchorRect={ANCHOR}
      canChangeStatus
      {...handlers}
      {...props}
    />,
  );
  return { ...result, ...handlers };
}

function twoComments(): ThreadView {
  return makeThread({
    comments: [
      makeComment({ id: "c1", body: "First", canEdit: true }),
      makeComment({ id: "c2", author: BOB, body: "Second", canEdit: false }),
    ],
  });
}

afterEach(() => {
  window.innerWidth = initial.width;
  window.innerHeight = initial.height;
});

describe("ThreadPanel", () => {
  it("is a named dialog placed next to the anchor", () => {
    renderPanel();

    const dialog = screen.getByRole("dialog", { name: "Thread 1" });

    expect(PANEL_WIDTH).toBe(320);
    expect(dialog.style.width).toBe("320px");
    expect(dialog.style.left).toBe("132px");
    expect(dialog.style.top).toBe("100px");
    expect(dialog.style.zIndex).toBe(String(Z_INDEX.panel));
    expect(dialog.className).toContain("fixed");
    expect(dialog.className).toContain(PANEL_SURFACE);
  });

  it("flips to the left of an anchor near the right edge", () => {
    window.innerWidth = 600;
    renderPanel({ anchorRect: { x: 560, y: 100, width: 24, height: 24 } });

    expect(screen.getByRole("dialog").style.left).toBe(String(560 - 8 - 320) + "px");
  });

  it("never grows beyond the viewport height", () => {
    window.innerHeight = 500;
    renderPanel();

    expect(screen.getByRole("dialog").style.maxHeight).toBe(
      `${String(500 - 2 * VIEWPORT_MARGIN)}px`,
    );
  });

  it("lists the comments in order", () => {
    renderPanel({ thread: twoComments() });

    const items = screen.getAllByRole("listitem");

    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain("First");
    expect(items[1]?.textContent).toContain("Second");
  });

  it("shows the thread status and a Resolve button for an open thread", async () => {
    const user = userEvent.setup();
    const { onToggleStatus } = renderPanel();

    expect(screen.getByText("Open")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Resolve" }));

    expect(onToggleStatus).toHaveBeenCalledTimes(1);
  });

  it("offers Reopen for a resolved thread", () => {
    renderPanel({ thread: makeThread({ status: "resolved" }) });

    expect(screen.getByText("Resolved")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reopen" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
  });

  it("hides the status toggle when the viewer cannot change the status", () => {
    renderPanel({ canChangeStatus: false });

    expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reopen" })).toBeNull();
    expect(screen.getByText("Open")).toBeTruthy();
  });

  it("closes from the close button", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();

    await user.click(screen.getByRole("button", { name: "Close thread" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the reply composer on open", () => {
    renderPanel();

    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Reply" }));
  });

  it("closes on Escape from the composer, from a button and not twice", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    screen.getByRole("button", { name: "Resolve" }).focus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("does not let Escape reach the page", async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    renderPanel();
    document.addEventListener("keydown", outer);

    await user.keyboard("{Escape}");
    document.removeEventListener("keydown", outer);

    expect(outer).not.toHaveBeenCalled();
  });

  it("returns focus to the element that had it before the panel opened", () => {
    const pin = document.createElement("button");
    document.body.append(pin);
    pin.focus();
    const { unmount } = renderPanel();

    expect(document.activeElement).not.toBe(pin);

    unmount();

    expect(document.activeElement).toBe(pin);
    pin.remove();
  });

  it("does not steal focus back when the user already moved it elsewhere", () => {
    const pin = document.createElement("button");
    const other = document.createElement("button");
    document.body.append(pin, other);
    pin.focus();
    const { unmount } = renderPanel();
    other.focus();

    unmount();

    expect(document.activeElement).toBe(other);
    pin.remove();
    other.remove();
  });

  it("restores focus inside a shadow root", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    const pin = document.createElement("button");
    shadow.append(pin, container);
    pin.focus();
    expect(shadow.activeElement).toBe(pin);

    const { unmount } = render(
      <ThreadPanel
        thread={makeThread()}
        anchorRect={ANCHOR}
        canChangeStatus
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onEditComment={vi.fn().mockResolvedValue(undefined)}
        onDeleteComment={vi.fn().mockResolvedValue(undefined)}
        onToggleStatus={vi.fn()}
        onClose={vi.fn()}
      />,
      { container },
    );
    expect(shadow.activeElement).not.toBe(pin);

    unmount();

    expect(shadow.activeElement).toBe(pin);
    host.remove();
  });

  it("sends a reply and clears the field", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderPanel();

    await user.type(screen.getByRole("textbox", { name: "Reply" }), "Thanks");
    await user.click(screen.getByRole("button", { name: "Reply" }));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ body: "Thanks", mentions: [] });
  });

  it("offers mention suggestions in the reply composer and reports the picks", async () => {
    const user = userEvent.setup();
    const candidates = [{ id: "u-max", displayName: "Max Member", avatarUrl: null }];
    const { onSubmit } = renderPanel({ mentionCandidates: candidates });

    await user.type(screen.getByRole("textbox", { name: "Reply" }), "@ma");
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Reply" }));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      body: "@Max Member",
      mentions: ["u-max"],
    });
  });

  it("keeps the editing composer free of mention suggestions", async () => {
    const user = userEvent.setup();
    renderPanel({
      thread: makeThread({ comments: [makeComment({ canEdit: true })] }),
      mentionCandidates: [{ id: "u-max", displayName: "Max Member", avatarUrl: null }],
    });

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(screen.getByRole("textbox", { name: "Edit comment" }), " @ma");

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("passes the error to the reply composer", () => {
    renderPanel({ error: "Offline" });

    expect(screen.getByRole("alert").textContent).toBe("Offline");
  });

  it("lets the viewer edit only their own comments", () => {
    renderPanel({ thread: twoComments() });

    const items = screen.getAllByRole("listitem").map((item) => within(item));

    expect(items[0]?.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(items[1]?.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(items).toHaveLength(2);
  });

  it("routes edits and deletions with the comment id", async () => {
    const user = userEvent.setup();
    const { onEditComment, onDeleteComment } = renderPanel({ thread: twoComments() });

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.keyboard("!{Control>}{Enter}{/Control}");
    expect(onEditComment).toHaveBeenCalledExactlyOnceWith("c1", "First!");

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(within(screen.getByRole("group")).getByRole("button", { name: "Delete" }));
    expect(onDeleteComment).toHaveBeenCalledExactlyOnceWith("c1");
  });

  it("closes the panel only once when Escape cancels an edit", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel({ thread: twoComments() });

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("shows the deleted placeholder inside the list", () => {
    renderPanel({
      thread: makeThread({ comments: [makeComment({ deleted: true, canEdit: true })] }),
    });

    expect(screen.getByText("Comment deleted")).toBeTruthy();
  });

  describe("new thread mode", () => {
    it("shows only a composer with a Comment button and no thread controls", () => {
      renderPanel({ thread: null });

      expect(screen.getByRole("dialog", { name: "New thread" })).toBeTruthy();
      expect(screen.queryByRole("list")).toBeNull();
      expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
      expect(screen.queryByText("Open")).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Comment" }));
      expect(screen.getByRole("button", { name: "Comment" })).toBeTruthy();
    });

    it("creates the thread with Ctrl+Enter", async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderPanel({ thread: null });

      await user.keyboard("First comment{Control>}{Enter}{/Control}");

      expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ body: "First comment", mentions: [] });
    });

    it("closes with Cancel and with Escape", async () => {
      const user = userEvent.setup();
      const { onClose } = renderPanel({ thread: null });

      await user.keyboard("{Escape}");
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onClose).toHaveBeenCalledTimes(2);
    });

    it("keeps the text when creating fails", async () => {
      const user = userEvent.setup();
      renderPanel({ thread: null, onSubmit: vi.fn().mockRejectedValue(new Error("x")) });

      await user.keyboard("Draft{Control>}{Enter}{/Control}");

      expect(await screen.findByRole("alert")).toBeTruthy();
      expect(screen.getByRole<HTMLTextAreaElement>("textbox").value).toBe("Draft");
    });
  });
});

describe("ThreadPanel context", () => {
  it("shows the context section inside the scrolling area of an existing thread", () => {
    renderPanel({
      thread: makeThread({
        hasScreenshot: true,
        context: {
          viewport: { width: 1440, height: 900 },
          devicePixelRatio: 2,
          pageTitle: "Northwind",
          url: "https://example.test/",
          browser: { name: "Chrome", version: "130" },
          os: { name: "Windows", version: "11" },
          userAgent: "ua",
          consoleErrors: [],
          capturedAt: "2026-10-22T09:30:00.000Z",
        },
      }),
      screenshot: { status: "ready", url: "https://x.test/s.webp" },
    });

    const section = screen.getByRole("region", { name: "Page context" });

    expect(within(section).getByText("1440×900 @2x")).toBeTruthy();
    expect(within(section).getByRole("link").getAttribute("href")).toBe("https://x.test/s.webp");
    expect(screen.getByRole("dialog").contains(section)).toBe(true);
  });

  it("says the context is unavailable for a thread without a valid context", () => {
    renderPanel();

    expect(screen.getByText("Context unavailable")).toBeTruthy();
  });

  it("shows no context for a new thread", () => {
    renderPanel({ thread: null });

    expect(screen.queryByRole("region", { name: "Page context" })).toBeNull();
  });
});
