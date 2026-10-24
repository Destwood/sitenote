import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DEMO_TESTIMONIAL, DemoSample } from ".";

const ANCHORED_TEST_IDS = [
  "demo-hero-title",
  "demo-feature-pins",
  "demo-pricing-team",
  "demo-testimonial-quote",
];

describe("DemoSample", () => {
  it("renders every element the seeded threads are anchored to", () => {
    const { container } = render(<DemoSample />);
    for (const testId of ANCHORED_TEST_IDS) {
      expect(container.querySelectorAll(`[data-testid="${testId}"]`)).toHaveLength(1);
    }
  });

  it("renders the testimonial as the exact sentence the text anchor quotes", () => {
    render(<DemoSample />);
    expect(screen.getByTestId("demo-testimonial-quote").textContent).toBe(DEMO_TESTIMONIAL);
  });

  it("renders the hero title that the seeded comment points at", () => {
    render(<DemoSample />);
    expect(screen.getByTestId("demo-hero-title").textContent).toBe(
      "Comments that stay on the page",
    );
  });
});
