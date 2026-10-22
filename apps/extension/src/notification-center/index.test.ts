import { describe, expect, it, vi } from "vitest";

import { failure, success, type MessageResult } from "../messages";
import type { NotificationHandlers } from "../realtime-channels";
import type { NotificationList } from "../transport";
import { createNotificationCenter, type NotificationData } from ".";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002";
const NOTIFICATION_ID = "50000000-0000-4000-8000-000000000001";

function deferred<Value>() {
  let resolve: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function setup(counts: (MessageResult<number> | Promise<MessageResult<number>>)[] = []) {
  const queue = [...counts];
  const data = {
    listNotifications: vi.fn<NotificationData["listNotifications"]>(),
    markNotificationsRead: vi
      .fn<NotificationData["markNotificationsRead"]>()
      .mockResolvedValue(success(null)),
    markAllNotificationsRead: vi
      .fn<NotificationData["markAllNotificationsRead"]>()
      .mockResolvedValue(success(null)),
    countUnreadNotifications: vi.fn<NotificationData["countUnreadNotifications"]>(() =>
      Promise.resolve(queue.shift() ?? success(0)),
    ),
  };
  const opened: {
    userId: string;
    handlers: NotificationHandlers;
    close: ReturnType<typeof vi.fn>;
  }[] = [];
  const channels = {
    open: vi.fn((userId: string, handlers: NotificationHandlers) => {
      const close = vi.fn();
      opened.push({ userId, handlers, close });
      return { close };
    }),
  };
  const badge = { show: vi.fn<(count: number) => Promise<void>>().mockResolvedValue(undefined) };
  const announce = vi.fn<(unread: number) => Promise<unknown>>().mockResolvedValue(undefined);
  const center = createNotificationCenter({ data, channels, badge, announce });
  return { center, data, channels, opened, badge, announce };
}

async function settle(): Promise<void> {
  await vi.waitFor(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("createNotificationCenter", () => {
  it("opens the channel for the signed-in user and shows the unread count", async () => {
    const { center, channels, badge, announce } = setup([success(3)]);

    center.onSession({ userId: USER_ID });
    await settle();

    expect(channels.open).toHaveBeenCalledExactlyOnceWith(USER_ID, expect.any(Object));
    expect(badge.show).toHaveBeenLastCalledWith(3);
    expect(announce).toHaveBeenCalledExactlyOnceWith(3);
  });

  it("does not reopen the channel for token refreshes of the same user", async () => {
    const { center, channels } = setup();

    center.onSession({ userId: USER_ID });
    center.onSession({ userId: USER_ID });
    await settle();

    expect(channels.open).toHaveBeenCalledTimes(1);
  });

  it("replaces the channel when another user signs in", async () => {
    const { center, opened } = setup();

    center.onSession({ userId: USER_ID });
    center.onSession({ userId: OTHER_USER_ID });
    await settle();

    expect(opened.map((entry) => entry.userId)).toEqual([USER_ID, OTHER_USER_ID]);
    expect(opened[0]?.close).toHaveBeenCalledTimes(1);
    expect(opened[1]?.close).not.toHaveBeenCalled();
  });

  it("clears the badge and closes the channel on sign-out", async () => {
    const { center, opened, badge, announce } = setup([success(4)]);
    center.onSession({ userId: USER_ID });
    await settle();

    center.onSession(null);
    await settle();

    expect(opened[0]?.close).toHaveBeenCalledTimes(1);
    expect(badge.show).toHaveBeenLastCalledWith(0);
    expect(announce).toHaveBeenLastCalledWith(0);
  });

  it("refreshes on a change and on every subscription", async () => {
    const { center, data, opened } = setup([success(1), success(2), success(2)]);
    center.onSession({ userId: USER_ID });
    await settle();
    const before = data.countUnreadNotifications.mock.calls.length;

    opened[0]?.handlers.onChange();
    await settle();
    opened[0]?.handlers.onSubscribed();
    await settle();

    expect(data.countUnreadNotifications.mock.calls.length).toBeGreaterThanOrEqual(before + 2);
  });

  it("announces only when the count changes and updates the badge every time", async () => {
    const { center, badge, announce } = setup([success(2), success(2), success(0)]);
    center.onSession({ userId: USER_ID });
    await settle();

    await center.refresh();
    await center.refresh();
    await settle();

    expect(announce.mock.calls.map(([unread]) => unread)).toEqual([2, 0]);
    expect(badge.show.mock.calls.map(([count]) => count)).toEqual(expect.arrayContaining([2, 0]));
  });

  it("coalesces refreshes requested while one is running into exactly one more", async () => {
    const first = deferred<MessageResult<number>>();
    const { center, data } = setup([first.promise, success(5)]);
    center.onSession({ userId: USER_ID });

    const running = center.refresh();
    void center.refresh();
    void center.refresh();
    first.resolve(success(1));
    await running;

    expect(data.countUnreadNotifications).toHaveBeenCalledTimes(2);
  });

  it("keeps the previous count when the count request fails", async () => {
    const { center, badge } = setup([success(2), failure("network")]);
    center.onSession({ userId: USER_ID });
    await settle();
    const calls = badge.show.mock.calls.length;

    await center.refresh();

    expect(badge.show.mock.calls.length).toBe(calls);
  });

  it("keeps the previous count when the count request throws", async () => {
    const { center, data, badge } = setup([success(2)]);
    center.onSession({ userId: USER_ID });
    await settle();
    data.countUnreadNotifications.mockRejectedValueOnce(new Error("offline"));
    const calls = badge.show.mock.calls.length;

    await center.refresh();

    expect(badge.show.mock.calls.length).toBe(calls);
  });

  it("drops a count that arrives after the user changed", async () => {
    const slow = deferred<MessageResult<number>>();
    const { center, badge } = setup([slow.promise, success(1)]);
    center.onSession({ userId: USER_ID });
    const running = center.refresh();

    center.onSession({ userId: OTHER_USER_ID });
    slow.resolve(success(9));
    await running;
    await center.refresh();

    expect(badge.show.mock.calls.map(([count]) => count)).not.toContain(9);
  });

  it("survives a failing badge or announcement", async () => {
    const { center, badge, announce } = setup([success(1)]);
    badge.show.mockRejectedValue(new Error("no action"));
    announce.mockRejectedValue(new Error("no receiver"));
    center.onSession({ userId: USER_ID });

    await expect(center.refresh()).resolves.toBeUndefined();
  });

  it("lists notifications and takes the unread count from the answer", async () => {
    const { center, data, badge } = setup();
    const list: NotificationList = { items: [], unread: 7 };
    data.listNotifications.mockResolvedValue(success(list));

    const result = await center.list(30);

    expect(data.listNotifications).toHaveBeenCalledExactlyOnceWith({
      type: "notifications.list",
      limit: 30,
    });
    expect(result).toEqual(success(list));
    expect(badge.show).toHaveBeenLastCalledWith(7);
  });

  it("leaves the badge alone when listing fails", async () => {
    const { center, data, badge } = setup();
    data.listNotifications.mockResolvedValue(failure("unauthorized"));

    const result = await center.list(30);

    expect(result.ok).toBe(false);
    expect(badge.show).not.toHaveBeenCalled();
  });

  it("recounts after marking read and passes the ids on", async () => {
    const { center, data, badge } = setup([success(0)]);
    center.onSession({ userId: USER_ID });

    const result = await center.markRead([NOTIFICATION_ID]);

    expect(data.markNotificationsRead).toHaveBeenCalledExactlyOnceWith({
      type: "notifications.markRead",
      ids: [NOTIFICATION_ID],
    });
    expect(result).toEqual(success(null));
    expect(data.countUnreadNotifications).toHaveBeenCalled();
    expect(badge.show).toHaveBeenLastCalledWith(0);
  });

  it("recounts after marking everything read", async () => {
    const { center, data } = setup([success(0)]);
    center.onSession({ userId: USER_ID });
    const before = data.countUnreadNotifications.mock.calls.length;

    await center.markAllRead();

    expect(data.markAllNotificationsRead).toHaveBeenCalledTimes(1);
    expect(data.countUnreadNotifications.mock.calls.length).toBeGreaterThan(before);
  });

  it("does not recount when marking fails", async () => {
    const { center, data } = setup();
    data.markAllNotificationsRead.mockResolvedValue(failure("forbidden"));

    const result = await center.markAllRead();

    expect(result.ok).toBe(false);
    expect(data.countUnreadNotifications).not.toHaveBeenCalled();
  });
});
