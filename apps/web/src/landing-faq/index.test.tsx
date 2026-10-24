import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LandingFaq } from ".";

describe("LandingFaq", () => {
  it("answers the privacy questions", () => {
    const { container } = render(<LandingFaq />);
    const section = screen.getByRole("region", { name: "Questions and privacy" });
    expect(container.querySelectorAll("details")).toHaveLength(4);
    expect(
      within(section).getByText("No. The extension works only on sites you enable.", {
        exact: false,
      }),
    ).toBeTruthy();
    expect(within(section).getByText("Where is my data stored?")).toBeTruthy();
  });
});
