import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LandingSteps } from ".";

describe("LandingSteps", () => {
  it("describes the three steps in order", () => {
    render(<LandingSteps />);
    const section = screen.getByRole("region", { name: "How it works" });
    const titles = within(section)
      .getAllByRole("listitem")
      .map((step) => within(step).getByRole("heading", { level: 3 }).textContent);
    expect(titles).toEqual(["Open the page", "Comment on what you see", "Share and resolve"]);
  });
});
