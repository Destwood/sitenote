import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EXTENSION_DOWNLOAD_URL } from "../extension-download";
import { AppAccount, AppHeader } from ".";

describe("AppHeader", () => {
  it("shows the connect and download links when the extension can be connected", () => {
    render(<AppHeader displayName="Yurii" canConnectExtension />);
    expect(screen.getByRole("link", { name: "Connect the extension" }).getAttribute("href")).toBe(
      "/extension/connect",
    );
    const download = screen.getByRole("link", { name: "Download extension" });
    expect(download.getAttribute("href")).toBe(EXTENSION_DOWNLOAD_URL);
    expect(download.hasAttribute("download")).toBe(true);
  });

  it("hides both extension links when the extension cannot be connected", () => {
    render(<AppHeader displayName="Yurii" canConnectExtension={false} />);
    expect(screen.queryByRole("link", { name: "Connect the extension" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Download extension" })).toBeNull();
  });
});

describe("AppAccount", () => {
  it("shows the connect and download links when the extension can be connected", () => {
    render(<AppAccount displayName="Yurii" canConnectExtension />);
    expect(screen.getByRole("link", { name: "Connect the extension" }).getAttribute("href")).toBe(
      "/extension/connect",
    );
    expect(screen.getByRole("link", { name: "Download extension" }).hasAttribute("download")).toBe(
      true,
    );
  });

  it("hides both extension links when the extension cannot be connected", () => {
    render(<AppAccount displayName="Yurii" canConnectExtension={false} />);
    expect(screen.queryByRole("link", { name: "Connect the extension" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Download extension" })).toBeNull();
  });
});
