import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Loading from "./loading";

describe("workspace loading state", () => {
  it("announces the loading state as a busy status region", () => {
    render(<Loading />);

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("renders six pulsing rows for the content", () => {
    const { container } = render(<Loading />);

    expect(container.querySelectorAll(".animate-pulse.bg-neutral-200")).toHaveLength(6);
  });
});
