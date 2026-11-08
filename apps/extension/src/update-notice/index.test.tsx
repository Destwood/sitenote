import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EXTENSION_DOWNLOAD_URL } from "@sitenote/core";
import { ExtensionUpdateNotice } from ".";

async function settle() {
  await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
}

function releaseFetcher(name: string) {
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(JSON.stringify({ name }), { status: 200 })),
  );
}

describe("ExtensionUpdateNotice", () => {
  it("offers the download when a newer build exists", async () => {
    const fetcher = releaseFetcher("Sitenote extension v0.1.12");

    render(<ExtensionUpdateNotice version="0.1.9" fetcher={fetcher} />);

    expect(await screen.findByText("A new Sitenote version (v0.1.12) is available")).toBeTruthy();
    const download = screen.getByRole("link", { name: "Download" });
    expect(download.getAttribute("href")).toBe(EXTENSION_DOWNLOAD_URL);
    expect(download.getAttribute("target")).toBe("_blank");
    expect(
      screen.getByText("Unzip over the old folder, then press reload on chrome://extensions."),
    ).toBeTruthy();
  });

  it("renders nothing when the installed build is the latest", async () => {
    const fetcher = releaseFetcher("Sitenote extension v0.1.12");

    const { container } = render(<ExtensionUpdateNotice version="0.1.12" fetcher={fetcher} />);

    await settle();
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when the latest build cannot be read", async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.reject(new TypeError("offline")));

    const { container } = render(<ExtensionUpdateNotice version="0.1.9" fetcher={fetcher} />);

    await settle();
    expect(container.innerHTML).toBe("");
  });
});
