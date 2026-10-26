import { describe, expect, it, vi } from "vitest";

import { failure, success, type MessageResult } from "@sitenote/widget";
import { createPermissionGrantHandler, originOfPattern } from ".";

const ORIGIN = "https://example.test";
const ENTRY = { tabId: 7, workspaceId: "10000000-0000-4000-8000-000000000001", at: 1000 };

function setup(
  entry: typeof ENTRY | null = ENTRY,
  enableResult: MessageResult<null> = success(null),
) {
  const take = vi.fn().mockResolvedValue(entry);
  const enable = vi.fn().mockResolvedValue(enableResult);
  const removeAccess = vi.fn().mockResolvedValue(undefined);
  const handle = createPermissionGrantHandler({
    pending: { take },
    enablement: { enable },
    removeAccess,
    now: () => 2000,
  });
  return { take, enable, removeAccess, handle };
}

describe("originOfPattern", () => {
  it("strips the path wildcard", () => {
    expect(originOfPattern("https://example.test/*")).toBe(ORIGIN);
  });

  it("rejects a pattern without the wildcard", () => {
    expect(originOfPattern("https://example.test")).toBeNull();
  });
});

describe("permission grant handler", () => {
  it("enables the site the user was asked about", async () => {
    const { take, enable, removeAccess, handle } = setup();

    await handle({ origins: [`${ORIGIN}/*`] });

    expect(take).toHaveBeenCalledWith(ORIGIN, 2000);
    expect(enable).toHaveBeenCalledWith({
      tabId: 7,
      origin: ORIGIN,
      workspaceId: ENTRY.workspaceId,
    });
    expect(removeAccess).not.toHaveBeenCalled();
  });

  it("ignores a permission nobody asked for", async () => {
    const { enable, handle } = setup(null);

    await handle({ origins: [`${ORIGIN}/*`] });

    expect(enable).not.toHaveBeenCalled();
  });

  it("gives the permission back when enabling fails", async () => {
    const { removeAccess, handle } = setup(ENTRY, failure("page_unavailable"));

    await handle({ origins: [`${ORIGIN}/*`] });

    expect(removeAccess).toHaveBeenCalledWith(ORIGIN);
  });

  it("copes with a grant that carries no origins and with an exception", async () => {
    const { enable, handle } = setup();
    enable.mockRejectedValue(new Error("boom"));

    await handle({});
    await expect(handle({ origins: [`${ORIGIN}/*`] })).resolves.toBeUndefined();
  });
});
