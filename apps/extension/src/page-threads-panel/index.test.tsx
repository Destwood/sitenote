import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ERROR_MESSAGES, failure, success } from "@sitenote/widget";
import type { PageThreadSummary } from "@sitenote/widget";
import { PageThreadsPanel, commentsSummary } from ".";

const mocks = vi.hoisted(() => ({
  listPageThreads: vi.fn(),
  openPageSidebar: vi.fn(),
  openPageThread: vi.fn(),
}));

vi.mock("../message-client", () => ({
  listPageThreads: mocks.listPageThreads,
  openPageSidebar: mocks.openPageSidebar,
  openPageThread: mocks.openPageThread,
}));

const TAB_ID = 7;
const DASHBOARD_URL = "https://app.sitenote.test/app/w/workspace-1";

function summary(
  overrides: Partial<PageThreadSummary> & Pick<PageThreadSummary, "id">,
): PageThreadSummary {
  return {
    number: 1,
    status: "open",
    excerpt: "The button label is unclear",
    authorName: "Max Member",
    replies: 0,
    detached: false,
    route: "/",
    current: true,
    hasRecording: false,
    ...overrides,
  };
}

const RESOLVED = summary({
  id: "30000000-0000-4000-8000-000000000001",
  number: 1,
  status: "resolved",
  excerpt: "Fixed already",
});
const OPEN_SECOND = summary({
  id: "30000000-0000-4000-8000-000000000002",
  number: 2,
  excerpt: "",
  replies: 1,
});
const OPEN_THIRD = summary({
  id: "30000000-0000-4000-8000-000000000003",
  number: 3,
  excerpt: "Detached one",
  detached: true,
  replies: 3,
});
const OPEN_FOURTH = summary({
  id: "30000000-0000-4000-8000-000000000004",
  number: 4,
});

beforeEach(() => {
  mocks.listPageThreads.mockReset();
  mocks.openPageSidebar.mockReset();
  mocks.openPageThread.mockReset();
});

describe("commentsSummary", () => {
  it.each([
    [0, 0, "No comments yet"],
    [2, 0, "No open comments"],
    [1, 1, "1 open comment"],
    [3, 2, "2 open comments"],
    [3, 3, "3 open comments"],
  ])("%i threads with %i open -> %s", (total, open, expected) => {
    expect(commentsSummary(total, open)).toBe(expected);
  });
});

describe("PageThreadsPanel", () => {
  it("shows a loading status until the threads arrive", async () => {
    let answer: (value: unknown) => void = () => undefined;
    mocks.listPageThreads.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    render(<PageThreadsPanel tabId={TAB_ID} dashboardUrl={DASHBOARD_URL} />);
    expect(screen.getByRole("status").textContent).toBe("Loading comments...");

    answer(success([]));
    expect(await screen.findByText("No comments yet")).toBeTruthy();
    expect(mocks.listPageThreads).toHaveBeenCalledWith(TAB_ID);
  });

  it("asks the content script again when the user tries again after a failure", async () => {
    const user = userEvent.setup();
    mocks.listPageThreads.mockResolvedValueOnce(failure("page_unavailable"));
    render(<PageThreadsPanel tabId={TAB_ID} dashboardUrl={DASHBOARD_URL} />);

    expect(await screen.findByText("Open the page to see its comments.")).toBeTruthy();

    mocks.listPageThreads.mockResolvedValueOnce(success([OPEN_SECOND]));
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("tab", { name: "Open (1)" })).toBeTruthy();
    expect(mocks.listPageThreads).toHaveBeenCalledTimes(2);
  });

  it("says there are no comments and offers no button when the page has none", async () => {
    mocks.listPageThreads.mockResolvedValue(success([]));

    render(<PageThreadsPanel tabId={TAB_ID} dashboardUrl={DASHBOARD_URL} />);

    expect((await screen.findByTestId("comments-summary")).textContent).toBe("No comments yet");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says there are no open comments when only resolved ones exist", async () => {
    mocks.listPageThreads.mockResolvedValue(success([RESOLVED]));

    render(<PageThreadsPanel tabId={TAB_ID} dashboardUrl={DASHBOARD_URL} />);

    expect(await screen.findByText("No open comments")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Resolved (1)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show all" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open comments" })).toBeTruthy();
  });

  it("shows the open count in the overview and hides the open buttons when the page has no comments", async () => {
    mocks.listPageThreads.mockResolvedValue(success([RESOLVED, OPEN_SECOND]));

    const { unmount } = render(<PageThreadsPanel tabId={TAB_ID} dashboardUrl={DASHBOARD_URL} />);

    expect(await screen.findByText("Open comments")).toBeTruthy();
    expect(screen.getAllByText("1", { selector: "span[aria-hidden='true']" })).toHaveLength(1);
    unmount();

    mocks.listPageThreads.mockResolvedValue(success([]));
    render(<PageThreadsPanel tabId={TAB_ID} dashboardUrl={DASHBOARD_URL} />);

    expect(await screen.findByTestId("comments-summary")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open comments" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show all" })).toBeNull();
  });

  it("counts open and resolved threads on the tabs and opens on Open", async () => {
    mocks.listPageThreads.mockResolvedValue(
      success([RESOLVED, OPEN_SECOND, OPEN_THIRD, OPEN_FOURTH]),
    );

    render(<PageThreadsPanel tabId={TAB_ID} dashboardUrl={DASHBOARD_URL} />);

    expect(
      (await screen.findByRole("tab", { name: "Open (3)" })).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByRole("tab", { name: "Resolved (1)" }).getAttribute("aria-selected")).toBe(
      "false",
    );
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(3);
  });

  it("opens the sidebar on the page and closes the popup", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.listPageThreads.mockResolvedValue(success([OPEN_THIRD]));
    mocks.openPageSidebar.mockResolvedValue(success({ opened: true }));

    render(<PageThreadsPanel tabId={TAB_ID} close={close} dashboardUrl={DASHBOARD_URL} />);
    await user.click(await screen.findByRole("button", { name: "Show all" }));

    expect(mocks.openPageSidebar).toHaveBeenCalledWith(TAB_ID);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("opens the same sidebar from the arrow button in the overview", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.listPageThreads.mockResolvedValue(success([OPEN_THIRD]));
    mocks.openPageSidebar.mockResolvedValue(success({ opened: true }));

    render(<PageThreadsPanel tabId={TAB_ID} close={close} dashboardUrl={DASHBOARD_URL} />);
    await user.click(await screen.findByRole("button", { name: "Open comments" }));

    expect(mocks.openPageSidebar).toHaveBeenCalledWith(TAB_ID);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps the popup open and shows the error when the page cannot open the sidebar", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.listPageThreads.mockResolvedValue(success([OPEN_SECOND]));
    mocks.openPageSidebar.mockResolvedValue(failure("page_unavailable"));

    render(<PageThreadsPanel tabId={TAB_ID} close={close} dashboardUrl={DASHBOARD_URL} />);
    await user.click(await screen.findByRole("button", { name: "Show all" }));

    expect((await screen.findByRole("alert")).textContent).toBe(ERROR_MESSAGES.page_unavailable);
    expect(close).not.toHaveBeenCalled();
  });

  it("lists the threads of the selected tab with their author, excerpt, replies and state", async () => {
    const user = userEvent.setup();
    mocks.listPageThreads.mockResolvedValue(success([RESOLVED, OPEN_SECOND, OPEN_THIRD]));

    render(<PageThreadsPanel tabId={TAB_ID} dashboardUrl={DASHBOARD_URL} />);

    const list = await screen.findByRole("list", { name: "Comments on this page" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getAllByText("Max Member")).toHaveLength(2);
    expect(within(list).getByText("(no text)")).toBeTruthy();
    expect(within(list).getByText("Detached one")).toBeTruthy();
    expect(within(list).getByText("Not found on page")).toBeTruthy();
    expect(within(list).getAllByText("3")).toHaveLength(2);

    await user.click(screen.getByRole("tab", { name: "Resolved (1)" }));

    const resolved = screen.getByRole("list", { name: "Comments on this page" });
    expect(within(resolved).getAllByRole("listitem")).toHaveLength(1);
    expect(within(resolved).getByText("Fixed already")).toBeTruthy();
    expect(within(resolved).getByText("Resolved")).toBeTruthy();
  });

  it("labels each comment as Video when it has a recording and as Text otherwise", async () => {
    mocks.listPageThreads.mockResolvedValue(
      success([
        OPEN_SECOND,
        summary({ id: "30000000-0000-4000-8000-000000000005", number: 5, hasRecording: true }),
      ]),
    );

    render(<PageThreadsPanel tabId={TAB_ID} dashboardUrl={DASHBOARD_URL} />);

    const list = await screen.findByRole("list", { name: "Comments on this page" });
    expect(within(list).getByText("Video")).toBeTruthy();
    expect(within(list).getByText("Text")).toBeTruthy();
  });

  it("opens the thread on the page and closes the popup when a comment is picked", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.listPageThreads.mockResolvedValue(success([OPEN_SECOND]));
    mocks.openPageThread.mockResolvedValue(success({ opened: true }));

    render(<PageThreadsPanel tabId={TAB_ID} close={close} dashboardUrl={DASHBOARD_URL} />);
    await user.click(await screen.findByRole("button", { name: /Max Member/ }));

    expect(mocks.openPageThread).toHaveBeenCalledWith(TAB_ID, OPEN_SECOND.id);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps the popup open and shows the error when the page cannot open the thread", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.listPageThreads.mockResolvedValue(success([OPEN_SECOND]));
    mocks.openPageThread.mockResolvedValue(failure("page_unavailable"));

    render(<PageThreadsPanel tabId={TAB_ID} close={close} dashboardUrl={DASHBOARD_URL} />);
    await user.click(await screen.findByRole("button", { name: /Max Member/ }));

    expect((await screen.findByRole("alert")).textContent).toBe(ERROR_MESSAGES.page_unavailable);
    expect(close).not.toHaveBeenCalled();
  });
});
