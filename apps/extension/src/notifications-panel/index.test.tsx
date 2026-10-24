import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { failure, success } from "@sitenote/widget";
import type { NotificationList, NotificationRecord } from "@sitenote/widget";
import {
  EMPTY_NOTIFICATIONS_MESSAGE,
  NOTIFICATIONS_PAGE_SIZE,
  NotificationsPanel,
  OPEN_FAILED_MESSAGE,
  describeNotification,
  describePage,
} from ".";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn<(request: { type: string }) => Promise<unknown>>(),
  onNotificationsChanged: vi.fn(),
  openThread: vi.fn(),
}));

vi.mock("../message-client", () => ({
  sendMessage: mocks.sendMessage,
  onNotificationsChanged: mocks.onNotificationsChanged,
}));

vi.mock("../open-thread", () => ({ openThread: mocks.openThread }));

const THREAD_ID = "30000000-0000-4000-8000-000000000001";

function record(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: "50000000-0000-4000-8000-000000000001",
    kind: "mention",
    threadId: THREAD_ID,
    pageUrl: "https://example.test/pricing",
    threadStatus: "open",
    excerpt: "Please check the price",
    actorName: "Max Member",
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    read: false,
    ...overrides,
  };
}

const REPLY = record({
  id: "50000000-0000-4000-8000-000000000002",
  kind: "reply",
  actorName: "Olena Owner",
  excerpt: "Fixed it",
  read: true,
  threadStatus: "resolved",
  pageUrl: "https://example.test/",
});

let changed: () => void;
let unsubscribe: ReturnType<typeof vi.fn>;

function answer(list: NotificationList) {
  mocks.sendMessage.mockImplementation((request: { type: string }) =>
    Promise.resolve(request.type === "notifications.list" ? success(list) : success(null)),
  );
}

function itemAt(items: HTMLElement[], index: number): HTMLElement {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`No notification at ${String(index)}`);
  }
  return item;
}

function typesSent(): string[] {
  return mocks.sendMessage.mock.calls.map(([request]) => request.type);
}

beforeEach(() => {
  mocks.sendMessage.mockReset();
  mocks.openThread.mockReset();
  mocks.openThread.mockResolvedValue(true);
  unsubscribe = vi.fn();
  mocks.onNotificationsChanged.mockReset();
  mocks.onNotificationsChanged.mockImplementation((listener: () => void) => {
    changed = listener;
    return unsubscribe;
  });
});

describe("describeNotification", () => {
  it("names the actor and the kind", () => {
    expect(describeNotification(record())).toBe("Max Member mentioned you");
    expect(describeNotification(REPLY)).toBe("Olena Owner replied in a thread");
  });
});

describe("describePage", () => {
  it.each([
    ["https://example.test/pricing", "example.test/pricing"],
    ["https://example.test/", "example.test"],
    ["http://127.0.0.1:4173/p/a", "127.0.0.1:4173/p/a"],
    ["nonsense", "nonsense"],
  ])("%s -> %s", (pageUrl, expected) => {
    expect(describePage(pageUrl)).toBe(expected);
  });
});

describe("NotificationsPanel", () => {
  it("asks for one page of notifications and shows a loading state first", async () => {
    answer({ items: [], unread: 0 });

    render(<NotificationsPanel onUnreadChange={vi.fn()} />);

    expect(screen.getByRole("status").textContent).toContain("Loading");
    expect(await screen.findByText(EMPTY_NOTIFICATIONS_MESSAGE)).toBeTruthy();
    expect(mocks.sendMessage).toHaveBeenCalledWith({
      type: "notifications.list",
      limit: NOTIFICATIONS_PAGE_SIZE,
    });
  });

  it("lists notifications with unread ones marked, and reports the unread count", async () => {
    const onUnreadChange = vi.fn();
    answer({ items: [record(), REPLY], unread: 1 });

    render(<NotificationsPanel onUnreadChange={onUnreadChange} />);

    const items = await screen.findAllByTestId("notification-item");
    expect(items.map((item) => item.getAttribute("data-unread"))).toEqual(["true", "false"]);
    const unread = within(itemAt(items, 0));
    expect(unread.getByText(/Max Member mentioned you/)).toBeTruthy();
    expect(unread.getByText("Unread.")).toBeTruthy();
    expect(unread.getByText("Please check the price")).toBeTruthy();
    expect(unread.getByText(/example\.test\/pricing/)).toBeTruthy();
    expect(unread.getByText(/5 minutes ago/)).toBeTruthy();
    expect(
      within(itemAt(items, 1)).getByText("Olena Owner replied in a thread (resolved)"),
    ).toBeTruthy();
    expect(screen.getByTestId("notifications-summary").textContent).toBe("1 unread");
    expect(onUnreadChange).toHaveBeenLastCalledWith(1);
  });

  it("renders the text of a comment as text", async () => {
    answer({
      items: [record({ excerpt: "<img src=x onerror=alert(1)>", actorName: "<b>Max</b>" })],
      unread: 1,
    });

    render(<NotificationsPanel onUnreadChange={vi.fn()} />);

    await screen.findByTestId("notification-item");
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("b")).toBeNull();
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  });

  it("says when everything is read and disables Mark all as read", async () => {
    answer({ items: [REPLY], unread: 0 });

    render(<NotificationsPanel onUnreadChange={vi.fn()} />);

    expect((await screen.findByTestId("notifications-summary")).textContent).toBe(
      "You are all caught up.",
    );
    expect(screen.getByRole("button", { name: "Mark all as read" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("marks an unread notification read and then opens its page", async () => {
    const user = userEvent.setup();
    const item = record();
    answer({ items: [item], unread: 1 });
    render(<NotificationsPanel onUnreadChange={vi.fn()} />);

    await user.click(await screen.findByTestId("notification-item"));

    await waitFor(() => {
      expect(mocks.openThread).toHaveBeenCalledExactlyOnceWith(item);
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith({
      type: "notifications.markRead",
      ids: [item.id],
    });
    const markedAt =
      mocks.sendMessage.mock.invocationCallOrder[typesSent().indexOf("notifications.markRead")];
    const openedAt = mocks.openThread.mock.invocationCallOrder[0];
    expect(markedAt).toBeDefined();
    expect(openedAt).toBeDefined();
    expect(markedAt).toBeLessThan(openedAt ?? 0);
  });

  it("opens a notification that is already read without marking it", async () => {
    const user = userEvent.setup();
    answer({ items: [REPLY], unread: 0 });
    render(<NotificationsPanel onUnreadChange={vi.fn()} />);

    await user.click(await screen.findByTestId("notification-item"));

    await waitFor(() => {
      expect(mocks.openThread).toHaveBeenCalledExactlyOnceWith(REPLY);
    });
    expect(typesSent()).not.toContain("notifications.markRead");
  });

  it("still opens the page when marking it read fails", async () => {
    const user = userEvent.setup();
    const item = record();
    mocks.sendMessage.mockImplementation((request: { type: string }) =>
      Promise.resolve(
        request.type === "notifications.list"
          ? success({ items: [item], unread: 1 })
          : failure("network"),
      ),
    );
    render(<NotificationsPanel onUnreadChange={vi.fn()} />);

    await user.click(await screen.findByTestId("notification-item"));

    await waitFor(() => {
      expect(mocks.openThread).toHaveBeenCalledTimes(1);
    });
  });

  it("tells the user when the page could not be opened", async () => {
    const user = userEvent.setup();
    answer({ items: [REPLY], unread: 0 });
    mocks.openThread.mockResolvedValue(false);
    render(<NotificationsPanel onUnreadChange={vi.fn()} />);

    await user.click(await screen.findByTestId("notification-item"));

    expect((await screen.findByRole("alert")).textContent).toBe(OPEN_FAILED_MESSAGE);
  });

  it("marks everything read and reloads the list", async () => {
    const user = userEvent.setup();
    const lists = [
      { items: [record(), REPLY], unread: 1 },
      { items: [{ ...record(), read: true }, REPLY], unread: 0 },
    ];
    mocks.sendMessage.mockImplementation((request: { type: string }) =>
      Promise.resolve(
        request.type === "notifications.list" ? success(lists.shift() ?? lists[0]) : success(null),
      ),
    );
    const onUnreadChange = vi.fn();
    render(<NotificationsPanel onUnreadChange={onUnreadChange} />);
    await screen.findAllByTestId("notification-item");

    await user.click(screen.getByRole("button", { name: "Mark all as read" }));

    await waitFor(() => {
      expect(onUnreadChange).toHaveBeenLastCalledWith(0);
    });
    expect(typesSent()).toContain("notifications.markAllRead");
    expect(screen.getAllByTestId("notification-item").map((item) => item.dataset.unread)).toEqual([
      "false",
      "false",
    ]);
  });

  it("shows the error when marking everything read fails", async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockImplementation((request: { type: string }) =>
      Promise.resolve(
        request.type === "notifications.list"
          ? success({ items: [record()], unread: 1 })
          : failure("forbidden"),
      ),
    );
    render(<NotificationsPanel onUnreadChange={vi.fn()} />);
    await screen.findByTestId("notification-item");

    await user.click(screen.getByRole("button", { name: "Mark all as read" }));

    expect((await screen.findByRole("alert")).textContent).toContain("do not have permission");
  });

  it("shows a load error and tries again", async () => {
    const user = userEvent.setup();
    mocks.sendMessage.mockResolvedValueOnce(failure("network"));
    render(<NotificationsPanel onUnreadChange={vi.fn()} />);
    expect((await screen.findByRole("alert")).textContent).toContain("could not reach the server");
    answer({ items: [record()], unread: 1 });

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByTestId("notification-item")).toBeTruthy();
  });

  it("reloads when the background announces a change and stops listening on unmount", async () => {
    answer({ items: [], unread: 0 });
    const { unmount } = render(<NotificationsPanel onUnreadChange={vi.fn()} />);
    await screen.findByText(EMPTY_NOTIFICATIONS_MESSAGE);
    answer({ items: [record()], unread: 1 });

    act(() => {
      changed();
    });

    expect(await screen.findByTestId("notification-item")).toBeTruthy();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("ignores an older answer that arrives after a newer one", async () => {
    const resolvers: ((value: unknown) => void)[] = [];
    mocks.sendMessage.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    render(<NotificationsPanel onUnreadChange={vi.fn()} />);
    act(() => {
      changed();
    });

    await act(async () => {
      resolvers[1]?.(success({ items: [record()], unread: 1 }));
      await Promise.resolve();
    });
    await act(async () => {
      resolvers[0]?.(success({ items: [], unread: 0 }));
      await Promise.resolve();
    });

    expect(screen.getAllByTestId("notification-item")).toHaveLength(1);
  });
});
