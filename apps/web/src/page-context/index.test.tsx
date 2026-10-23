import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageContext } from ".";

describe("PageContext", () => {
  it("says when the thread has no screenshot and no context", () => {
    render(<PageContext context={null} hasScreenshot={false} />);

    expect(screen.getByText("No screenshot saved.")).toBeTruthy();
    expect(screen.getByText("Context unavailable")).toBeTruthy();
  });

  it("links the screenshot to its full view", () => {
    render(
      <PageContext
        context={null}
        hasScreenshot
        screenshot={{ status: "ready", url: "https://storage.example.test/shot.webp" }}
      />,
    );

    expect(
      screen
        .getByRole("link", { name: "Open the full screenshot in a new tab" })
        .getAttribute("href"),
    ).toBe("https://storage.example.test/shot.webp");
  });
});
