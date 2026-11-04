import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EXTENSION_DOWNLOAD_URL } from "../extension-download";
import { InstallInstructions } from ".";

describe("InstallInstructions", () => {
  it("links the latest build and gives the steps to load it unpacked", () => {
    render(<InstallInstructions lead="Install it to continue." />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    const download = screen.getByRole("link", { name: "Download extension (.zip)" });
    expect(download.getAttribute("href")).toBe(EXTENSION_DOWNLOAD_URL);
    expect(download.hasAttribute("download")).toBe(true);
  });
});
