import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HelloOverlay } from "./index";

describe("HelloOverlay", () => {
  it("renders a status region with the default title", () => {
    render(<HelloOverlay />);

    const status = screen.getByRole("status");

    expect(status.getAttribute("data-testid")).toBe("sitenote-hello");
    expect(status.textContent).toContain("Sitenote");
    expect(status.textContent).toContain("Overlay is running");
  });

  it("renders a custom title", () => {
    render(<HelloOverlay title="Custom" />);

    expect(screen.getByRole("status").textContent).toContain("Custom");
  });
});
