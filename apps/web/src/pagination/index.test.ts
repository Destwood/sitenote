import { describe, expect, it } from "vitest";

import { PAGE_SIZE, pageCount, pageOffset, parsePageNumber } from ".";

describe("parsePageNumber", () => {
  it.each([
    [undefined, 1],
    ["3", 3],
    ["0", 1],
    ["-2", 1],
    ["abc", 1],
    ["2.5", 1],
    ["9999999", 1000000],
  ])("reads %s as page %i", (value, expected) => {
    expect(parsePageNumber(value)).toBe(expected);
  });
});

describe("pageOffset", () => {
  it("skips the pages before the requested one", () => {
    expect(pageOffset(1)).toBe(0);
    expect(pageOffset(3)).toBe(2 * PAGE_SIZE);
  });
});

describe("pageCount", () => {
  it("counts whole pages and keeps at least one", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(PAGE_SIZE)).toBe(1);
    expect(pageCount(PAGE_SIZE + 1)).toBe(2);
  });
});
