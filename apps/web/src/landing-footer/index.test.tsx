import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LandingFooter } from ".";

describe("LandingFooter", () => {
  it("links the demo and sign-in from the footer navigation", () => {
    render(<LandingFooter />);
    const nav = screen.getByRole("navigation", { name: "Footer" });
    expect(within(nav).getByRole("link", { name: "Demo" }).getAttribute("href")).toBe("/demo");
    expect(within(nav).getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe(
      "/sign-in",
    );
  });
});
