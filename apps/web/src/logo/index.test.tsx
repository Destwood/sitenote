import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Logo } from ".";

describe("Logo", () => {
  it("draws the brand mark as a decorative svg at the requested size", () => {
    const { container } = render(<Logo size={40} className="shrink-0" />);

    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("width")).toBe("40");
    expect(svg?.getAttribute("height")).toBe("40");
    expect(svg?.getAttribute("viewBox")).toBe("0 0 128 128");
    expect(svg?.getAttribute("class")).toBe("shrink-0");
    expect(svg?.querySelectorAll("rect, path, circle")).toHaveLength(3);
  });

  it("defaults to 28px", () => {
    const { container } = render(<Logo />);

    expect(container.querySelector("svg")?.getAttribute("width")).toBe("28");
  });
});
