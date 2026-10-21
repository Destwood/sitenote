import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Z_INDEX } from "../z-index";
import { HighlightBox } from ".";

describe("HighlightBox", () => {
  it("covers the given rectangle in viewport coordinates", () => {
    render(<HighlightBox rect={{ x: 10, y: 20, width: 300, height: 40 }} />);

    const box = screen.getByTestId("sitenote-highlight");

    expect(box.style.left).toBe("10px");
    expect(box.style.top).toBe("20px");
    expect(box.style.width).toBe("300px");
    expect(box.style.height).toBe("40px");
    expect(box.style.zIndex).toBe(String(Z_INDEX.highlight));
  });

  it("never intercepts pointer events and is hidden from assistive technology", () => {
    render(<HighlightBox rect={{ x: 0, y: 0, width: 1, height: 1 }} />);

    const box = screen.getByTestId("sitenote-highlight");

    expect(box.className).toContain("pointer-events-none");
    expect(box.className).toContain("fixed");
    expect(box.getAttribute("aria-hidden")).toBe("true");
  });

  it("follows a new rectangle", () => {
    const { rerender } = render(<HighlightBox rect={{ x: 1, y: 2, width: 3, height: 4 }} />);

    rerender(<HighlightBox rect={{ x: 5, y: 6, width: 7, height: 8 }} />);

    expect(screen.getByTestId("sitenote-highlight").style.left).toBe("5px");
  });
});
