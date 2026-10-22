import { describe, expect, it, vi } from "vitest";

import { BADGE_COLOR, createBadge, formatBadgeText, type ActionLike } from ".";

describe("formatBadgeText", () => {
  it.each([
    [0, ""],
    [-3, ""],
    [Number.NaN, ""],
    [Number.POSITIVE_INFINITY, ""],
    [1, "1"],
    [42, "42"],
    [99, "99"],
    [100, "99+"],
    [2500, "99+"],
    [7.9, "7"],
    [0.5, ""],
  ])("shows %s as %j", (count, text) => {
    expect(formatBadgeText(count)).toBe(text);
  });
});

function fakeAction() {
  const action = {
    setBadgeText: vi.fn<ActionLike["setBadgeText"]>().mockResolvedValue(undefined),
    setBadgeBackgroundColor: vi
      .fn<ActionLike["setBadgeBackgroundColor"]>()
      .mockResolvedValue(undefined),
  };
  return action;
}

describe("createBadge", () => {
  it("sets the colour once and writes the formatted text on every update", async () => {
    const action = fakeAction();
    const badge = createBadge(action);

    await badge.show(3);
    await badge.show(150);
    await badge.show(0);

    expect(action.setBadgeBackgroundColor).toHaveBeenCalledExactlyOnceWith({ color: BADGE_COLOR });
    expect(action.setBadgeText.mock.calls.map(([details]) => details.text)).toEqual([
      "3",
      "99+",
      "",
    ]);
  });
});
