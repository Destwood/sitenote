import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ERROR_MESSAGES, THREAD_NOT_HERE_MESSAGE, failure, success } from "@sitenote/widget";
import type { PageThreadSummary } from "@sitenote/widget";
import { PageThreadsPanel } from ".";

const mocks = vi.hoisted(() => ({
  listPageThreads: vi.fn(),
  openPageThread: vi.fn(),
}));

vi.mock("../message-client", () => ({
  listPageThreads: mocks.listPageThreads,
  openPageThread: mocks.openPageThread,
}));

const TAB_ID = 7;

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

beforeEach(() => {
  mocks.listPageThreads.mockReset();
  mocks.openPageThread.mockReset();
});

describe("PageThreadsPanel", () => {
  it("shows a loading status until the threads arrive", async () => {
    let answer: (value: unknown) => void = () => undefined;
    mocks.listPageThreads.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    render(<PageThreadsPanel tabId={TAB_ID} onCount={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toBe("Loading comments...");

    answer(success([]));
    expect(await screen.findByText(/No comments yet/)).toBeTruthy();
    expect(mocks.listPageThreads).toHaveBeenCalledWith(TAB_ID);
  });

  it("asks the content script again when the user tries again after a failure", async () => {
    const user = userEvent.setup();
    mocks.listPageThreads.mockResolvedValueOnce(failure("page_unavailable"));
    render(<PageThreadsPanel tabId={TAB_ID} onCount={vi.fn()} />);

    expect(await screen.findByText("Open the page to see its comments.")).toBeTruthy();

    mocks.listPageThreads.mockResolvedValueOnce(success([RESOLVED]));
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("list", { name: "Comments on this page" })).toBeTruthy();
    expect(mocks.listPageThreads).toHaveBeenCalledTimes(2);
  });

  it("lists open threads first, then resolved ones, each in number order", async () => {
    mocks.listPageThreads.mockResolvedValue(success([RESOLVED, OPEN_THIRD, OPEN_SECOND]));

    render(<PageThreadsPanel tabId={TAB_ID} onCount={vi.fn()} />);

    const list = await screen.findByRole("list", { name: "Comments on this page" });
    const numbers = within(list)
      .getAllByRole("listitem")
      .map((item) => /#\d+/.exec(item.textContent)?.[0]);
    expect(numbers).toEqual(["#2", "#3", "#1"]);
  });

  it("marks resolved and detached threads with badges and shows the author and reply count", async () => {
    mocks.listPageThreads.mockResolvedValue(success([RESOLVED, OPEN_THIRD]));

    render(<PageThreadsPanel tabId={TAB_ID} onCount={vi.fn()} />);

    const list = await screen.findByRole("list", { name: "Comments on this page" });
    expect(within(list).getByText("Resolved")).toBeTruthy();
    expect(within(list).getByText("Detached")).toBeTruthy();
    expect(within(list).getByText("Max Member · 3 replies")).toBeTruthy();
    expect(within(list).getByText("Fixed already")).toBeTruthy();
  });

  it("uses the singular for one reply", async () => {
    mocks.listPageThreads.mockResolvedValue(success([OPEN_SECOND]));

    render(<PageThreadsPanel tabId={TAB_ID} onCount={vi.fn()} />);

    expect(await screen.findByText("Max Member · 1 reply")).toBeTruthy();
  });

  it("reports the number of open threads", async () => {
    const onCount = vi.fn();
    mocks.listPageThreads.mockResolvedValue(success([RESOLVED, OPEN_THIRD, OPEN_SECOND]));

    render(<PageThreadsPanel tabId={TAB_ID} onCount={onCount} />);

    await screen.findByRole("list", { name: "Comments on this page" });
    expect(onCount).toHaveBeenLastCalledWith(2);
  });

  it("opens the thread on the page and closes the popup", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.listPageThreads.mockResolvedValue(success([OPEN_THIRD]));
    mocks.openPageThread.mockResolvedValue(success({ opened: true }));

    render(<PageThreadsPanel tabId={TAB_ID} onCount={vi.fn()} close={close} />);
    await user.click(await screen.findByRole("button", { name: /Detached one/ }));

    expect(mocks.openPageThread).toHaveBeenCalledWith(TAB_ID, OPEN_THIRD.id);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps the popup open and explains when the thread is no longer on the page", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.listPageThreads.mockResolvedValue(success([OPEN_SECOND]));
    mocks.openPageThread.mockResolvedValue(success({ opened: false }));

    render(<PageThreadsPanel tabId={TAB_ID} onCount={vi.fn()} close={close} />);
    await user.click(await screen.findByRole("button", { name: /No text/ }));

    expect((await screen.findByRole("alert")).textContent).toBe(THREAD_NOT_HERE_MESSAGE);
    expect(close).not.toHaveBeenCalled();
  });

  it("shows the error when the page cannot open the thread", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.listPageThreads.mockResolvedValue(success([OPEN_SECOND]));
    mocks.openPageThread.mockResolvedValue(failure("page_unavailable"));

    render(<PageThreadsPanel tabId={TAB_ID} onCount={vi.fn()} close={close} />);
    await user.click(await screen.findByRole("button", { name: /No text/ }));

    expect((await screen.findByRole("alert")).textContent).toBe(ERROR_MESSAGES.page_unavailable);
    expect(close).not.toHaveBeenCalled();
  });

  it("says there are no comments when the page has none", async () => {
    mocks.listPageThreads.mockResolvedValue(success([]));

    render(<PageThreadsPanel tabId={TAB_ID} onCount={vi.fn()} />);

    expect(
      await screen.findByText("No comments yet. Turn on Comment mode or right-click an element."),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Comments on this page" })).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
