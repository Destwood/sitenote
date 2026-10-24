import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LandingHero } from ".";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LandingHero", () => {
  it("states the headline and links the demo and the install section", () => {
    const list: Pick<
      MediaQueryList,
      "matches" | "media" | "addEventListener" | "removeEventListener"
    > = {
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.spyOn(window, "matchMedia").mockImplementation(() => list as MediaQueryList);
    render(<LandingHero />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Figma-style comments on any live website." }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Try the live demo" }).getAttribute("href")).toBe(
      "/demo",
    );
    expect(screen.getByRole("link", { name: "Install the extension" }).getAttribute("href")).toBe(
      "#install",
    );
  });
});
