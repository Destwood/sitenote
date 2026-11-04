import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EXTENSION_DOWNLOAD_URL } from "../extension-download";
import { LandingInstall } from ".";

describe("LandingInstall", () => {
  it("offers the latest build as a download and gives the steps to load it unpacked", () => {
    render(<LandingInstall />);
    const section = screen.getByRole("region", { name: "Install the extension" });
    expect(section.id).toBe("install");
    expect(within(section).getAllByRole("listitem")).toHaveLength(3);
    expect(within(section).getByText("Chrome Web Store listing coming soon.")).toBeTruthy();
    const download = within(section).getByRole("link", { name: "Download extension (.zip)" });
    expect(download.getAttribute("href")).toBe(EXTENSION_DOWNLOAD_URL);
    expect(download.hasAttribute("download")).toBe(true);
  });
});
