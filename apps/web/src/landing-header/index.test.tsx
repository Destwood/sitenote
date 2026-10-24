import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LandingHeader } from ".";

describe("LandingHeader", () => {
  it("links the sections, the demo and sign-in, and skips to the main content", () => {
    render(<LandingHeader githubUrl={null} />);
    expect(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href")).toBe(
      "#main",
    );
    expect(screen.getByRole("link", { name: "Features" }).getAttribute("href")).toBe("#features");
    expect(screen.getByRole("link", { name: "Demo" }).getAttribute("href")).toBe("/demo");
    expect(screen.getByRole("link", { name: "Install" }).getAttribute("href")).toBe("#install");
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
  });

  it("shows the GitHub link only when a URL is configured", () => {
    const { unmount } = render(<LandingHeader githubUrl={null} />);
    expect(screen.queryByRole("link", { name: "GitHub" })).toBeNull();
    unmount();

    render(<LandingHeader githubUrl="https://github.com/example/sitenote" />);
    expect(screen.getByRole("link", { name: "GitHub" }).getAttribute("href")).toBe(
      "https://github.com/example/sitenote",
    );
  });
});
