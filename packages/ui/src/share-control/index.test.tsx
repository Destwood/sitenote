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

  it("reports the chosen access", async () => {
    const user = userEvent.setup();
    const { onAccessChange } = renderControl();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Who can open the link" }),
      "link",
    );

    expect(onAccessChange).toHaveBeenCalledExactlyOnceWith("link");
  });

  it("shows the current access and locks the choice while a change is pending", () => {
    renderControl({ access: "link", pending: true });

    const select = screen.getByRole<HTMLSelectElement>("combobox", {
      name: "Who can open the link",
    });
    expect(select.value).toBe("link");
    expect(select.disabled).toBe(true);
    expect(Array.from(select.options).map((option) => [option.value, option.textContent])).toEqual([
      ["workspace", "Workspace members"],
      ["link", "Anyone with the link"],
    ]);
  });

  it("copies the link and shows Copied until the feedback delay ends", async () => {
    vi.useFakeTimers();
    const { onCopy } = renderControl();

    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await act(() => Promise.resolve());

    expect(onCopy).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
  });

  it("says when the link could not be copied", async () => {
    const onCopy = vi.fn(() => false);
    render(
      <ShareControl access="workspace" pending={false} onAccessChange={vi.fn()} onCopy={onCopy} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(await screen.findByRole("button", { name: "Could not copy" })).toBeTruthy();
  });
});
