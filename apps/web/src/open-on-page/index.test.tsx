import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExtensionResult } from "../extension-bridge";

const mocks = vi.hoisted(() => ({
  pingExtension: vi.fn<(id: string) => Promise<ExtensionResult>>(),
}));

vi.mock("../extension-bridge", () => ({ pingExtension: mocks.pingExtension }));

import { OpenOnPage } from ".";

const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";
const THREAD_ID = "20000000-0000-4000-8000-000000000001";
const PAGE_URL = "https://example.test/pricing";

function renderOpenOnPage() {
  render(<OpenOnPage pageUrl={PAGE_URL} threadId={THREAD_ID} extensionId={EXTENSION_ID} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OpenOnPage", () => {
  it("checks for the extension with its id while it waits", () => {
    mocks.pingExtension.mockReturnValue(new Promise(() => undefined));

    renderOpenOnPage();

    expect(screen.getByRole("status").textContent).toBe("Checking for the Sitenote extension...");
    expect(mocks.pingExtension).toHaveBeenCalledWith(EXTENSION_ID);
  });

  it("opens the page with the thread in its hash when the extension is present", async () => {
    mocks.pingExtension.mockResolvedValue({ status: "ok" });
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const user = userEvent.setup();
    renderOpenOnPage();

    await user.click(await screen.findByRole("button", { name: "Open on page" }));

    expect(open).toHaveBeenCalledWith(`${PAGE_URL}#sitenote=${THREAD_ID}`, "_blank", "noopener");
    expect(screen.queryByRole("link", { name: "Open page" })).toBeNull();
  });

  it("offers the install steps and a plain page link when the extension is absent", async () => {
    mocks.pingExtension.mockResolvedValue({ status: "unavailable" });
    renderOpenOnPage();

    expect(
      await screen.findByRole("heading", { name: "Install the Sitenote extension" }),
    ).toBeTruthy();
    const link = screen.getByRole("link", { name: "Open page" });
    expect(link.getAttribute("href")).toBe(PAGE_URL);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.queryByRole("button", { name: "Open on page" })).toBeNull();
  });
});
