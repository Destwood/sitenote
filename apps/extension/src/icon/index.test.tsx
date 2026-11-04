import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Icon, type IconName } from ".";

describe("Icon", () => {
  it.each<IconName>([
    "bell",
    "more",
    "arrow",
    "external",
    "chevron",
    "close",
    "users",
    "logout",
    "sites",
    "table",
    "comment",
    "error",
    "extension",
  ])("draws %s as a decorative 24px outline svg", (name) => {
    const { container } = render(<Icon name={name} />);

    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg?.getAttribute("stroke")).toBe("currentColor");
    expect(svg?.getAttribute("stroke-width")).toBe("1.8");
    expect(svg?.childElementCount).toBeGreaterThan(0);
  });

  it("uses 16px by default and accepts a size and a class", () => {
    const { container } = render(<Icon name="close" size={24} className="rotate-180" />);

    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("24");
    expect(svg?.getAttribute("height")).toBe("24");
    expect(svg?.getAttribute("class")).toBe("rotate-180");
  });
});
