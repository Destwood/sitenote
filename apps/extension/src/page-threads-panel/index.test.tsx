import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ERROR_MESSAGES, failure, success } from "@sitenote/widget";
import type { PageThreadSummary } from "@sitenote/widget";
import { PageThreadsPanel, commentsSummary } from ".";

const mocks = vi.hoisted(() => ({
  listPageThreads: vi.fn(),
  openPageSidebar: vi.fn(),
}));

vi.mock("../message-client", () => ({
  listPageThreads: mocks.listPageThreads,
  openPageSidebar: mocks.openPageSidebar,
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
const OPEN_FOURTH = summary({
  id: "30000000-0000-4000-8000-000000000004",
  number: 4,
});

beforeEach(() => {
  mocks.listPageThreads.mockReset();
  mocks.openPageSidebar.mockReset();
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

    render(<PageThreadsPanel tabId={TAB_ID} />);
    expect(screen.getByRole("status").textContent).toBe("Loading comments...");

    answer(success([]));
    expect(await screen.findByText("No comments yet")).toBeTruthy();
    expect(mocks.listPageThreads).toHaveBeenCalledWith(TAB_ID);
  });

  it("asks the content script again when the user tries again after a failure", async () => {
    const user = userEvent.setup();
    mocks.listPageThreads.mockResolvedValueOnce(failure("page_unavailable"));
    render(<PageThreadsPanel tabId={TAB_ID} />);

    expect(await screen.findByText("Open the page to see its comments.")).toBeTruthy();

    mocks.listPageThreads.mockResolvedValueOnce(success([OPEN_SECOND]));
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByTestId("comments-summary")).toBeTruthy();
    expect(mocks.listPageThreads).toHaveBeenCalledTimes(2);
  });

  it("says there are no comments and offers no button when the page has none", async () => {
    mocks.listPageThreads.mockResolvedValue(success([]));

    render(<PageThreadsPanel tabId={TAB_ID} />);

    expect((await screen.findByTestId("comments-summary")).textContent).toBe("No comments yet");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says there are no open comments when only resolved ones exist", async () => {
    mocks.listPageThreads.mockResolvedValue(success([RESOLVED]));

    render(<PageThreadsPanel tabId={TAB_ID} />);

    expect((await screen.findByTestId("comments-summary")).textContent).toBe("No open comments");
    expect(screen.getByRole("button", { name: "Open on page" })).toBeTruthy();
  });

  it("uses the singular for one open comment", async () => {
    mocks.listPageThreads.mockResolvedValue(success([RESOLVED, OPEN_SECOND]));

    render(<PageThreadsPanel tabId={TAB_ID} />);

    expect((await screen.findByTestId("comments-summary")).textContent).toBe("1 open comment");
  });

  it("counts only open threads in the plural summary", async () => {
    mocks.listPageThreads.mockResolvedValue(
      success([RESOLVED, OPEN_SECOND, OPEN_THIRD, OPEN_FOURTH]),
    );

    render(<PageThreadsPanel tabId={TAB_ID} />);

    expect((await screen.findByTestId("comments-summary")).textContent).toBe("3 open comments");
  });

  it("opens the sidebar on the page and closes the popup", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.listPageThreads.mockResolvedValue(success([OPEN_THIRD]));
    mocks.openPageSidebar.mockResolvedValue(success({ opened: true }));

    render(<PageThreadsPanel tabId={TAB_ID} close={close} />);
    await user.click(await screen.findByRole("button", { name: "Open on page" }));

    expect(mocks.openPageSidebar).toHaveBeenCalledWith(TAB_ID);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps the popup open and shows the error when the page cannot open the sidebar", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    mocks.listPageThreads.mockResolvedValue(success([OPEN_SECOND]));
    mocks.openPageSidebar.mockResolvedValue(failure("page_unavailable"));

    render(<PageThreadsPanel tabId={TAB_ID} close={close} />);
    await user.click(await screen.findByRole("button", { name: "Open on page" }));

    expect((await screen.findByRole("alert")).textContent).toBe(ERROR_MESSAGES.page_unavailable);
    expect(close).not.toHaveBeenCalled();
  });
});
