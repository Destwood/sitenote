import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LandingFeatures } from ".";

describe("LandingFeatures", () => {
  it("lists the six features under the Features heading", () => {
    const { container } = render(<LandingFeatures />);
    const section = screen.getByRole("region", { name: "Features" });
    expect(container.querySelector("#features")).toBe(section);
    expect(within(section).getAllByRole("article")).toHaveLength(6);
    expect(within(section).getByRole("heading", { level: 3, name: "Deep links" })).toBeTruthy();
  });
});
