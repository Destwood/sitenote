import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { COPY_BLOCKED_TEXT, CopyLink, LINK_COPIED_TEXT } from ".";

const LINK = "https://app.sitenote.test/t/20000000-0000-4000-8000-000000000001";

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("CopyLink", () => {
  it("shows the link in a read-only field", () => {
    render(<CopyLink label="Thread link" value={LINK} />);

    const field = screen.getByLabelText("Thread link");
    expect((field as HTMLInputElement).value).toBe(LINK);
    expect(field.getAttribute("readonly")).not.toBeNull();
  });

  it("copies the link and confirms", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard(writeText);
    render(<CopyLink label="Thread link" value={LINK} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(await screen.findByText(LINK_COPIED_TEXT)).toBeTruthy();
  });

  it("explains a blocked copy", async () => {
    stubClipboard(() => Promise.reject(new Error("blocked")));
    render(<CopyLink label="Thread link" value={LINK} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    expect(await screen.findByText(COPY_BLOCKED_TEXT)).toBeTruthy();
  });
});
