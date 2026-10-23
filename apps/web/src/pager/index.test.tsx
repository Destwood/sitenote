import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Pager } from ".";

describe("Pager", () => {
  it("renders nothing for a single page", () => {
    const { container } = render(<Pager page={1} pages={1} previousHref={null} nextHref={null} />);

    expect(container.innerHTML).toBe("");
  });

  it("links to the neighbouring pages and states the position", () => {
    render(<Pager page={2} pages={3} previousHref="/threads?pg=1" nextHref="/threads?pg=3" />);

    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Previous" }).getAttribute("href")).toBe(
      "/threads?pg=1",
    );
    expect(screen.getByRole("link", { name: "Next" }).getAttribute("href")).toBe("/threads?pg=3");
  });

  it("disables the missing direction on the first and last page", () => {
    render(<Pager page={3} pages={3} previousHref="/threads?pg=2" nextHref={null} />);

    expect(screen.queryByRole("link", { name: "Next" })).toBeNull();
    expect(screen.getByText("Next")).toBeTruthy();
  });
});
