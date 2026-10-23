import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ connectExtension: vi.fn() }));

vi.mock("../extension-connection", () => ({ connectExtension: mocks.connectExtension }));

import { ExtensionConnect } from ".";

const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";

function setup() {
  const user = userEvent.setup();
  render(<ExtensionConnect extensionId={EXTENSION_ID} />);
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ExtensionConnect", () => {
  it("offers to connect and does nothing until asked", () => {
    setup();

    expect(screen.getByRole("button", { name: "Connect the extension" })).toBeTruthy();
    expect(mocks.connectExtension).not.toHaveBeenCalled();
  });

  it("confirms a connected extension and asks for the web copy to be dropped", async () => {
    mocks.connectExtension.mockResolvedValue({ status: "connected", webCopyCleared: true });
    const user = setup();

    await user.click(screen.getByRole("button", { name: "Connect the extension" }));

    expect(await screen.findByTestId("extension-connected")).toHaveProperty(
      "textContent",
      "The extension is connected. You can close this tab.",
    );
    expect(mocks.connectExtension).toHaveBeenCalledWith(EXTENSION_ID);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("warns when a web copy is still held by this browser", async () => {
    mocks.connectExtension.mockResolvedValue({ status: "connected", webCopyCleared: false });
    const user = setup();

    await user.click(screen.getByRole("button", { name: "Connect the extension" }));

    expect(await screen.findByText(/still holds a copy of your web session/)).toBeTruthy();
  });

  it("shows the install instructions when the extension is missing and retries", async () => {
    mocks.connectExtension.mockResolvedValueOnce({ status: "missing" });
    const user = setup();

    await user.click(screen.getByRole("button", { name: "Connect the extension" }));
    expect(
      await screen.findByRole("heading", { name: "Install the Sitenote extension" }),
    ).toBeTruthy();

    mocks.connectExtension.mockResolvedValueOnce({ status: "connected", webCopyCleared: true });
    await user.click(screen.getByRole("button", { name: "I installed it — connect" }));

    await waitFor(() => {
      expect(screen.getByTestId("extension-connected")).toBeTruthy();
    });
  });

  it("explains an extension signed in to another account and allows another try", async () => {
    mocks.connectExtension.mockResolvedValueOnce({ status: "alreadySignedIn" });
    const user = setup();

    await user.click(screen.getByRole("button", { name: "Connect the extension" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "signed in as another account",
    );
    expect(screen.getByRole("button", { name: "Connect again" })).toBeTruthy();
  });

  it("reports a failed connection and allows another try", async () => {
    mocks.connectExtension.mockResolvedValueOnce({ status: "failed" });
    const user = setup();

    await user.click(screen.getByRole("button", { name: "Connect the extension" }));

    expect((await screen.findByRole("alert")).textContent).toContain("could not accept");
    expect(screen.getByRole("button", { name: "Try connecting again" })).toBeTruthy();
  });
});
