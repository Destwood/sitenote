import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ThreadTypeBadge } from ".";

describe("ThreadTypeBadge", () => {
  it("labels a thread with a recording as Video in the accent color", () => {
    const { container } = render(<ThreadTypeBadge video />);

    const label = screen.getByText("Video");
    expect(label.className).toContain("text-blue-800");
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelectorAll("rect")).toHaveLength(1);
  });

  it("labels a thread without a recording as Text in the muted color", () => {
    const { container } = render(<ThreadTypeBadge video={false} />);

    const label = screen.getByText("Text");
    expect(label.className).toContain("text-neutral-600");
    expect(label.className).not.toContain("text-blue-800");
    expect(container.querySelectorAll("rect")).toHaveLength(0);
  });
});
