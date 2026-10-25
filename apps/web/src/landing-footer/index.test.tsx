import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LandingFooter } from ".";

describe("LandingFooter", () => {
  it("links the demo and sign-in from the footer navigation", () => {
    render(<LandingFooter signedIn={false} />);
    const nav = screen.getByRole("navigation", { name: "Footer" });
    expect(within(nav).getByRole("link", { name: "Demo" }).getAttribute("href")).toBe("/demo");
    expect(within(nav).getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe(
      "/sign-in",
    );
  });

  it("links a signed-in member to the dashboard instead of sign-in", () => {
    render(<LandingFooter signedIn />);
    const nav = screen.getByRole("navigation", { name: "Footer" });
    expect(within(nav).getByRole("link", { name: "Dashboard" }).getAttribute("href")).toBe("/app");
    expect(within(nav).queryByRole("link", { name: "Sign in" })).toBeNull();
  });
});
