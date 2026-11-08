import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EXTENSION_DOWNLOAD_URL } from "@sitenote/core";

const mocks = vi.hoisted(() => ({ readExtensionVersion: vi.fn() }));

vi.mock("../extension-bridge", () => ({ readExtensionVersion: mocks.readExtensionVersion }));

import { ExtensionUpdateBanner } from ".";

const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";

function stubLatestRelease(name: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ name }), { status: 200 }))),
  );
}

async function settle() {
  await vi.waitFor(() => {
    expect(mocks.readExtensionVersion).toHaveBeenCalled();
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("ExtensionUpdateBanner", () => {
  it("offers the download when the installed extension is older than the latest build", async () => {
    mocks.readExtensionVersion.mockResolvedValue("0.1.9");
    stubLatestRelease("Sitenote extension v0.1.10");

    render(<ExtensionUpdateBanner extensionId={EXTENSION_ID} />);

    expect(await screen.findByText("A new Sitenote extension (v0.1.10) is available")).toBeTruthy();
    const download = screen.getByRole("link", { name: "Download extension (.zip)" });
    expect(download.getAttribute("href")).toBe(EXTENSION_DOWNLOAD_URL);
    expect(download.hasAttribute("download")).toBe(true);
    expect(
      screen.getByText("Unzip over the old folder, then press reload on chrome://extensions."),
    ).toBeTruthy();
    expect(mocks.readExtensionVersion).toHaveBeenCalledWith(EXTENSION_ID);
  });

  it("renders nothing when the installed extension is up to date", async () => {
    mocks.readExtensionVersion.mockResolvedValue("0.1.10");
    stubLatestRelease("Sitenote extension v0.1.10");

    const { container } = render(<ExtensionUpdateBanner extensionId={EXTENSION_ID} />);

    await settle();
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when the extension is not installed", async () => {
    mocks.readExtensionVersion.mockResolvedValue(null);
    stubLatestRelease("Sitenote extension v0.1.10");

    const { container } = render(<ExtensionUpdateBanner extensionId={EXTENSION_ID} />);

    await settle();
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when the latest build cannot be read", async () => {
    mocks.readExtensionVersion.mockResolvedValue("0.1.9");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("offline"))),
    );

    const { container } = render(<ExtensionUpdateBanner extensionId={EXTENSION_ID} />);

    await settle();
    expect(container.innerHTML).toBe("");
  });

  it("does not look for the extension without an id", async () => {
    stubLatestRelease("Sitenote extension v0.1.10");

    const { container } = render(<ExtensionUpdateBanner extensionId="" />);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mocks.readExtensionVersion).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
  });
});
