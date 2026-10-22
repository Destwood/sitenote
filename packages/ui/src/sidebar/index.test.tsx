import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { BOB, makeComment, makeThread } from "../test-fixtures";
import type { ThreadView } from "../types";
import { Z_INDEX } from "../z-index";
import { EMPTY_MESSAGE, ORPHAN_NOTE, Sidebar, type SidebarProps } from ".";

function threads(): ThreadView[] {
  return [
    makeThread({ id: "open-1", number: 1, comments: [makeComment({ body: "Fix the header" })] }),
    makeThread({
      id: "resolved-2",
      number: 2,
      status: "resolved",
      comments: [makeComment({ body: "Typo fixed" })],
    }),
    makeThread({
      id: "open-3",
      number: 3,
      author: BOB,
      comments: [makeComment({ body: "Wrong colour" }), makeComment({ id: "c2", body: "Agreed" })],
    }),
    makeThread({
      id: "orphan-4",
      number: 4,
      orphaned: true,
      anchorLabel: "div.promo > a",
      comments: [makeComment({ body: "Remove banner" })],
    }),
  ];
}

interface HarnessProps extends Omit<SidebarProps, "showResolved" | "onShowResolvedChange"> {
  initialShowResolved: boolean;
  onShowResolvedChange: (value: boolean) => void;
}

function Harness({ initialShowResolved, onShowResolvedChange, ...props }: HarnessProps) {
  const [showResolved, setShowResolved] = useState(initialShowResolved);
  return (
    <Sidebar
      {...props}
      showResolved={showResolved}
      onShowResolvedChange={(value) => {
        setShowResolved(value);
        onShowResolvedChange(value);
      }}
    />
  );
}

function renderSidebar(
  list: ThreadView[] = threads(),
  activeThreadId: string | null = null,
  initialShowResolved = false,
) {
  const onSelectThread = vi.fn();
  const onClose = vi.fn();
  const onShowResolvedChange = vi.fn();
  render(
    <Harness
      threads={list}
      activeThreadId={activeThreadId}
      initialShowResolved={initialShowResolved}
      onShowResolvedChange={onShowResolvedChange}
      onSelectThread={onSelectThread}
      onClose={onClose}
    />,
  );
  return { onSelectThread, onClose, onShowResolvedChange };
}

describe("Sidebar", () => {
  it("is a labelled right-side drawer above the pins", () => {
    renderSidebar();

    const drawer = screen.getByRole("complementary", { name: "Comments" });

    expect(drawer.className).toContain("fixed");
    expect(drawer.className).toContain("right-0");
    expect(drawer.style.zIndex).toBe(String(Z_INDEX.sidebar));
    expect(Z_INDEX.sidebar).toBeGreaterThan(Z_INDEX.pins);
  });

  it("shows the counts in the header", () => {
    renderSidebar();

    expect(screen.getByText(/^2 open · 1 resolved · 1 orphaned$/)).toBeTruthy();
  });

  it("omits the orphaned count when nothing is orphaned", () => {
    renderSidebar(threads().slice(0, 3));

    expect(screen.getByText(/^2 open · 1 resolved$/)).toBeTruthy();
  });

  it("lists open threads on the page and hides resolved ones behind a toggle", () => {
    renderSidebar();

    const section = screen.getByRole("region", { name: "On this page" });

    expect(within(section).getByText("Fix the header")).toBeTruthy();
    expect(within(section).getByText("Wrong colour")).toBeTruthy();
    expect(within(section).queryByText("Typo fixed")).toBeNull();
    expect(
      within(section)
        .getByRole("button", { name: "Show resolved (1)" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("shows the resolved threads from the start when the toggle is on", () => {
    renderSidebar(threads(), null, true);

    expect(screen.getByText(/Typo fixed/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Hide resolved (1)" }).getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("reveals and hides the resolved threads and reports the choice", async () => {
    const user = userEvent.setup();
    const { onShowResolvedChange } = renderSidebar();

    await user.click(screen.getByRole("button", { name: "Show resolved (1)" }));

    expect(onShowResolvedChange).toHaveBeenLastCalledWith(true);

    const toggle = screen.getByRole("button", { name: "Hide resolved (1)" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/Typo fixed/)).toBeTruthy();

    await user.click(toggle);

    expect(onShowResolvedChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByText("Typo fixed")).toBeNull();
  });

  it("keeps open threads in the given order before resolved ones", async () => {
    const user = userEvent.setup();
    renderSidebar();
    await user.click(screen.getByRole("button", { name: "Show resolved (1)" }));

    const previews = within(screen.getByRole("region", { name: "On this page" }))
      .getAllByRole("button")
      .map((button) => button.textContent);

    expect(previews[0]).toContain("Fix the header");
    expect(previews[1]).toContain("Wrong colour");
    expect(previews.at(-1)).toContain("Typo fixed");
  });

  it("lists orphaned threads separately with their anchor and an explanation", () => {
    renderSidebar();

    const section = screen.getByRole("region", { name: "Orphaned" });

    expect(within(section).getByText(ORPHAN_NOTE)).toBeTruthy();
    expect(within(section).getByText("div.promo > a")).toBeTruthy();
    expect(within(section).getByText("Remove banner")).toBeTruthy();
    expect(screen.getByRole("region", { name: "On this page" }).textContent).not.toContain(
      "Remove banner",
    );
  });

  it("shows orphaned resolved threads in the orphaned group", () => {
    renderSidebar([
      makeThread({ id: "o", orphaned: true, status: "resolved", anchorLabel: "p.x" }),
    ]);

    expect(screen.queryByRole("region", { name: "On this page" })).toBeNull();
    expect(within(screen.getByRole("region", { name: "Orphaned" })).getByText("p.x")).toBeTruthy();
  });

  it("shows the comment count and the author", () => {
    renderSidebar();

    expect(screen.getByText("2 comments")).toBeTruthy();
    expect(screen.getAllByText("1 comment").length).toBeGreaterThan(0);
    expect(screen.getByText(/Bob Reviewer/)).toBeTruthy();
  });

  it("gives each item an accessible thread number", () => {
    renderSidebar();

    expect(screen.getByRole("button", { name: /^Thread 3,/ })).toBeTruthy();
  });

  it("selects a thread by id with the mouse and the keyboard", async () => {
    const user = userEvent.setup();
    const { onSelectThread } = renderSidebar();

    await user.click(screen.getByRole("button", { name: /Fix the header/ }));
    screen.getByRole("button", { name: /Wrong colour/ }).focus();
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: /Remove banner/ }));

    expect(onSelectThread.mock.calls).toEqual([["open-1"], ["open-3"], ["orphan-4"]]);
  });

  it("marks the active thread", () => {
    renderSidebar(threads(), "open-3");

    expect(screen.getByRole("button", { name: /Wrong colour/ }).getAttribute("aria-current")).toBe(
      "true",
    );
    expect(
      screen.getByRole("button", { name: /Fix the header/ }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("uses a placeholder preview when every comment is deleted", () => {
    renderSidebar([makeThread({ comments: [makeComment({ deleted: true, body: "gone" })] })]);

    expect(screen.queryByText("gone")).toBeNull();
    expect(screen.getByText("Comment deleted")).toBeTruthy();
  });

  it("shows plain text for comment bodies", () => {
    renderSidebar([makeThread({ comments: [makeComment({ body: "<script>alert(1)</script>" })] })]);

    expect(screen.getByText("<script>alert(1)</script>")).toBeTruthy();
    expect(document.querySelector("script")).toBeNull();
  });

  it("tells the user when there are no comments", () => {
    renderSidebar([]);

    expect(screen.getByText(EMPTY_MESSAGE)).toBeTruthy();
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("says so when only resolved threads exist on the page", () => {
    renderSidebar([makeThread({ status: "resolved" })]);

    expect(screen.getByText("No open comments.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show resolved (1)" })).toBeTruthy();
  });

  it("closes from the button and on Escape", async () => {
    const user = userEvent.setup();
    const { onClose } = renderSidebar();

    await user.click(screen.getByRole("button", { name: "Close comments" }));
    screen.getByRole("button", { name: /Fix the header/ }).focus();
    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
