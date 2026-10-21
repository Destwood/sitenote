import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Avatar, safeAvatarUrl } from ".";

describe("safeAvatarUrl", () => {
  it.each([
    ["https://cdn.example.test/a.png", "https://cdn.example.test/a.png"],
    ["http://cdn.example.test/a.png", null],
    ["javascript:alert(1)", null],
    ["data:image/svg+xml;base64,AAAA", null],
    ["//cdn.example.test/a.png", null],
    ["not a url", null],
    [null, null],
  ])("maps %s", (input, expected) => {
    expect(safeAvatarUrl(input)).toBe(expected);
  });
});

describe("Avatar", () => {
  it("renders an https image without a referrer", () => {
    const { container } = render(
      <Avatar
        person={{ id: "u1", displayName: "Ann", avatarUrl: "https://cdn.example.test/a.png" }}
      />,
    );

    const image = container.querySelector("img");

    expect(image?.getAttribute("src")).toBe("https://cdn.example.test/a.png");
    expect(image?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(image?.getAttribute("alt")).toBe("");
  });

  it("falls back to the initial for an unsafe url", () => {
    const { container } = render(
      <Avatar person={{ id: "u1", displayName: "  ann", avatarUrl: "javascript:alert(1)" }} />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("A");
  });

  it("shows a question mark for an empty name", () => {
    const { container } = render(
      <Avatar person={{ id: "u1", displayName: " ", avatarUrl: null }} />,
    );

    expect(container.textContent).toBe("?");
  });
});
