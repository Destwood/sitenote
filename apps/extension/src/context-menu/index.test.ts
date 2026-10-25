import { describe, expect, it, vi } from "vitest";

import {
  COMMENT_ON_ELEMENT_MENU_ID,
  COMMENT_ON_ELEMENT_TITLE,
  createContextMenuClickListener,
  createContextMenuSync,
  originPattern,
} from ".";

const ITEM = {
  id: COMMENT_ON_ELEMENT_MENU_ID,
  title: COMMENT_ON_ELEMENT_TITLE,
  contexts: ["page", "image", "link", "video", "audio", "editable"],
};

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("originPattern", () => {
  it("matches every page of the origin", () => {
    expect(originPattern("https://example.test")).toBe("https://example.test/*");
  });
});

describe("createContextMenuSync", () => {
  it("creates the item for the enabled origins only", async () => {
    const create = vi.fn();
    const sync = createContextMenuSync({
      removeAll: vi.fn().mockResolvedValue(undefined),
      create,
      listOrigins: vi.fn().mockResolvedValue(["https://a.test", "https://b.test"]),
    });

    await sync();

    expect(create).toHaveBeenCalledExactlyOnceWith({
      ...ITEM,
      documentUrlPatterns: ["https://a.test/*", "https://b.test/*"],
    });
  });

  it("removes the old item and creates no item when no origin is enabled", async () => {
    const create = vi.fn();
    const removeAll = vi.fn().mockResolvedValue(undefined);
    const sync = createContextMenuSync({
      removeAll,
      create,
      listOrigins: vi.fn().mockResolvedValue([]),
    });

    await sync();

    expect(removeAll).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("removes the old items before it reads the origins", async () => {
    const calls: string[] = [];
    const sync = createContextMenuSync({
      removeAll: () => {
        calls.push("removeAll");
        return Promise.resolve();
      },
      create: () => {
        calls.push("create");
      },
      listOrigins: () => {
        calls.push("listOrigins");
        return Promise.resolve(["https://a.test"]);
      },
    });

    await sync();

    expect(calls).toEqual(["removeAll", "listOrigins", "create"]);
  });

  it("runs overlapping syncs one after another", async () => {
    const calls: string[] = [];
    const gate = deferred();
    let firstList = true;
    const sync = createContextMenuSync({
      removeAll: () => {
        calls.push("removeAll");
        return Promise.resolve();
      },
      create: () => {
        calls.push("create");
      },
      listOrigins: async () => {
        calls.push("listOrigins");
        if (firstList) {
          firstList = false;
          await gate.promise;
        }
        return ["https://a.test"];
      },
    });

    const first = sync();
    const second = sync();
    await vi.waitFor(() => {
      expect(calls).toEqual(["removeAll", "listOrigins"]);
    });

    gate.resolve();
    await Promise.all([first, second]);

    expect(calls).toEqual([
      "removeAll",
      "listOrigins",
      "create",
      "removeAll",
      "listOrigins",
      "create",
    ]);
  });

  it("keeps syncing after a failed one", async () => {
    const create = vi.fn();
    const listOrigins = vi
      .fn<() => Promise<string[]>>()
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockResolvedValue(["https://a.test"]);
    const sync = createContextMenuSync({
      removeAll: vi.fn().mockResolvedValue(undefined),
      create,
      listOrigins,
    });

    await expect(sync()).rejects.toThrow("storage unavailable");
    await sync();

    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("createContextMenuClickListener", () => {
  const info = { menuItemId: COMMENT_ON_ELEMENT_MENU_ID, frameId: 0 };

  it("comments on the element of the tab that was clicked", () => {
    const commentOnElement = vi.fn().mockResolvedValue({ ok: true });

    createContextMenuClickListener({ commentOnElement })(info, { id: 7 });

    expect(commentOnElement).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("ignores other menu items", () => {
    const commentOnElement = vi.fn().mockResolvedValue({ ok: true });

    createContextMenuClickListener({ commentOnElement })(
      { menuItemId: "other", frameId: 0 },
      { id: 7 },
    );

    expect(commentOnElement).not.toHaveBeenCalled();
  });

  it("ignores clicks from an iframe", () => {
    const commentOnElement = vi.fn().mockResolvedValue({ ok: true });

    createContextMenuClickListener({ commentOnElement })({ ...info, frameId: 3 }, { id: 7 });

    expect(commentOnElement).not.toHaveBeenCalled();
  });

  it("ignores a click without a tab", () => {
    const commentOnElement = vi.fn().mockResolvedValue({ ok: true });

    createContextMenuClickListener({ commentOnElement })(info, undefined);
    createContextMenuClickListener({ commentOnElement })(info, {});

    expect(commentOnElement).not.toHaveBeenCalled();
  });

  it("swallows a rejection of the comment", async () => {
    const commentOnElement = vi.fn().mockRejectedValue(new Error("no page"));

    expect(() => {
      createContextMenuClickListener({ commentOnElement })(info, { id: 7 });
    }).not.toThrow();
    await Promise.resolve();
  });
});
