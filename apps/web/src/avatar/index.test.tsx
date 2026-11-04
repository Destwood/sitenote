import { describe, expect, it } from "vitest";

import { initialsOf } from ".";

describe("initialsOf", () => {
  it.each([
    ["Anna Lee", "AL"],
    ["  olena   owner  ", "OO"],
    ["Max", "M"],
    ["Ann Marie Smith", "AS"],
    ["", "?"],
  ])("derives the initials of %j", (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
});
