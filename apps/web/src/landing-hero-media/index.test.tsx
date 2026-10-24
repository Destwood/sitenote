import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LandingHeroMedia } from ".";

const MEDIA_WITH_VIDEO = { poster: "/media/poster.png", video: "/media/demo.webm" };
const MEDIA_ALT = "A comment pinned to a card on a sample page, with its thread open";

function stubReducedMotion(reduced: boolean) {
  const list: Pick<
    MediaQueryList,
    "matches" | "media" | "addEventListener" | "removeEventListener"
  > = {
    matches: reduced,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.spyOn(window, "matchMedia").mockImplementation(() => list as MediaQueryList);
}

function videoElement(container: HTMLElement): HTMLVideoElement {
  const video = container.querySelector("video");
  if (video === null) {
    throw new Error("The video element is missing.");
  }
  return video;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LandingHeroMedia", () => {
  it("shows only the poster when there is no video yet", () => {
    stubReducedMotion(false);
    const { container } = render(
      <LandingHeroMedia media={{ poster: "/media/poster.png", video: null }} />,
    );
    expect(screen.getByRole("img", { name: MEDIA_ALT })).toBeTruthy();
    expect(container.querySelector("video")).toBeNull();
    expect(screen.queryByRole("button", { name: "Play the product video" })).toBeNull();
  });

  it("autoplays a muted, looping video when motion is allowed", async () => {
    stubReducedMotion(false);
    const { container } = render(<LandingHeroMedia media={MEDIA_WITH_VIDEO} />);
    await waitFor(() => {
      expect(container.querySelector("video")).not.toBeNull();
    });
    const video = videoElement(container);
    expect(video.getAttribute("src")).toBe("/media/demo.webm");
    expect(video.getAttribute("poster")).toBe("/media/poster.png");
    expect(video.hasAttribute("autoplay")).toBe(true);
    expect(video.hasAttribute("loop")).toBe(true);
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(video.muted).toBe(true);
  });

  it("keeps the poster and a play button, without autoplay, when reduced motion is requested", () => {
    stubReducedMotion(true);
    const { container } = render(<LandingHeroMedia media={MEDIA_WITH_VIDEO} />);
    expect(container.querySelector("video")).toBeNull();
    expect(screen.getByRole("img", { name: MEDIA_ALT })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play the product video" })).toBeTruthy();
  });

  it("starts the video only after the visitor presses play under reduced motion", async () => {
    stubReducedMotion(true);
    const user = userEvent.setup();
    const { container } = render(<LandingHeroMedia media={MEDIA_WITH_VIDEO} />);
    await user.click(screen.getByRole("button", { name: "Play the product video" }));
    const video = videoElement(container);
    expect(video.getAttribute("src")).toBe("/media/demo.webm");
    expect(video.hasAttribute("controls")).toBe(true);
    expect(screen.queryByRole("button", { name: "Play the product video" })).toBeNull();
  });
});
