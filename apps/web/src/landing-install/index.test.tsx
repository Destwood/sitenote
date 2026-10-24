import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LandingInstall } from ".";

describe("LandingInstall", () => {
  it("gives the steps to load the unpacked build and no store link", () => {
    render(<LandingInstall />);
    const section = screen.getByRole("region", { name: "Install the extension" });
    expect(section.id).toBe("install");
    expect(within(section).getAllByRole("listitem")).toHaveLength(3);
    expect(within(section).getByText("Chrome Web Store listing coming soon.")).toBeTruthy();
    expect(within(section).queryByRole("link")).toBeNull();
  });
});
