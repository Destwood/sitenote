import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LandingHeader } from ".";

describe("LandingHeader", () => {
  it("links the sections, the demo and sign-in, and skips to the main content", () => {
    render(<LandingHeader githubUrl={null} signedIn={false} />);
    expect(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href")).toBe(
      "#main",
    );
    expect(screen.getByRole("link", { name: "Features" }).getAttribute("href")).toBe("#features");
    expect(screen.getByRole("link", { name: "How it works" }).getAttribute("href")).toBe(
      "#how-it-works",
    );
    expect(screen.getByRole("link", { name: "Demo" }).getAttribute("href")).toBe("/demo");
    expect(screen.getByRole("link", { name: "Download" }).getAttribute("href")).toBe("#install");
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
  });

  it("prefixes the in-page anchors with the base path", () => {
    render(<LandingHeader githubUrl={null} signedIn={false} basePath="/" />);
    expect(screen.getByRole("link", { name: "Skip to content" }).getAttribute("href")).toBe(
      "/#main",
    );
    expect(screen.getByRole("link", { name: "Features" }).getAttribute("href")).toBe("/#features");
    expect(screen.getByRole("link", { name: "How it works" }).getAttribute("href")).toBe(
      "/#how-it-works",
    );
    expect(screen.getByRole("link", { name: "Download" }).getAttribute("href")).toBe("/#install");
  });

  it("links a signed-in member to the dashboard instead of sign-in", () => {
    render(<LandingHeader githubUrl={null} signedIn />);
    expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("href")).toBe(
      "/app/dashboard",
    );
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("shows the GitHub link only when a URL is configured", () => {
    const { unmount } = render(<LandingHeader githubUrl={null} signedIn={false} />);
    expect(screen.queryByRole("link", { name: "GitHub" })).toBeNull();
    unmount();

    render(<LandingHeader githubUrl="https://github.com/example/sitenote" signedIn={false} />);
    expect(screen.getByRole("link", { name: "GitHub" }).getAttribute("href")).toBe(
      "https://github.com/example/sitenote",
    );
  });
});
