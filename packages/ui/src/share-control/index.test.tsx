import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShareControl } from ".";

function renderControl(props: { access?: "workspace" | "link"; pending?: boolean } = {}) {
  const onAccessChange = vi.fn();
  const onCopy = vi.fn(() => true);
  render(
    <ShareControl
      access={props.access ?? "workspace"}
      pending={props.pending ?? false}
      onAccessChange={onAccessChange}
      onCopy={onCopy}
    />,
  );
  return { onAccessChange, onCopy };
}

describe("ShareControl", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports the chosen access and closes the menu", async () => {
    const user = userEvent.setup();
    const { onAccessChange } = renderControl();

    await user.click(screen.getByRole("button", { name: "Who can open the link" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Anyone with the link" }));

    expect(onAccessChange).toHaveBeenCalledExactlyOnceWith("link");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("marks the current access and lists both options", async () => {
    const user = userEvent.setup();
    renderControl({ access: "link" });

    await user.click(screen.getByRole("button", { name: "Who can open the link" }));

    expect(
      screen.getByRole("menuitemradio", { name: "Workspace members" }).getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      screen
        .getByRole("menuitemradio", { name: "Anyone with the link" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("disables the access menu while a change is pending", () => {
    renderControl({ access: "link", pending: true });

    const chevron = screen.getByRole<HTMLButtonElement>("button", {
      name: "Who can open the link",
    });
    expect(chevron.disabled).toBe(true);
  });

  it("closes the menu on Escape and returns focus to the chevron", async () => {
    const user = userEvent.setup();
    renderControl();

    const chevron = screen.getByRole("button", { name: "Who can open the link" });
    await user.click(chevron);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(chevron);
  });

  it("moves between options with the arrow keys", async () => {
    const user = userEvent.setup();
    renderControl();

    await user.click(screen.getByRole("button", { name: "Who can open the link" }));
    expect(document.activeElement).toBe(
      screen.getByRole("menuitemradio", { name: "Workspace members" }),
    );
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(
      screen.getByRole("menuitemradio", { name: "Anyone with the link" }),
    );
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(
      screen.getByRole("menuitemradio", { name: "Workspace members" }),
    );
  });

  it("closes the menu when pressing outside", async () => {
    const user = userEvent.setup();
    renderControl();

    await user.click(screen.getByRole("button", { name: "Who can open the link" }));
    await user.click(document.body);

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("copies the link and shows Copied until the feedback delay ends", async () => {
    vi.useFakeTimers();
    const { onCopy } = renderControl();

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await act(() => Promise.resolve());

    expect(onCopy).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Copied");
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("says when the link could not be copied", async () => {
    const onCopy = vi.fn(() => false);
    render(
      <ShareControl access="workspace" pending={false} onAccessChange={vi.fn()} onCopy={onCopy} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));

    expect(await screen.findByRole("button", { name: "Could not copy" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Could not copy");
  });
});
