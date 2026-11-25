import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReplayButton } from ".";
import { SECONDARY_BUTTON } from "../control-classes";

describe("ReplayButton", () => {
  it("replays step by step by default with the existing button styles", async () => {
    const onReplay = vi.fn();
    render(<ReplayButton onReplay={onReplay} className="custom" />);
    const action = screen.getByRole("button", { name: "Replay on page Step by step" });
    expect(action.className).toBe(`${SECONDARY_BUTTON} rounded-r-none`);
    expect(action.parentElement?.className).toBe("relative inline-flex custom");
    expect(screen.getByRole("button", { name: "Choose replay mode" }).className).toBe(
      `${SECONDARY_BUTTON} rounded-l-none border-l-0 px-2`,
    );
    await userEvent.click(action);
    expect(onReplay).toHaveBeenCalledExactlyOnceWith("step");
  });

  it("immediately replays the selected mode and remembers it for the main action", async () => {
    const user = userEvent.setup();
    const onReplay = vi.fn();
    render(<ReplayButton onReplay={onReplay} label="Reproduce" />);
    const choose = screen.getByRole("button", { name: "Choose replay mode" });
    await user.click(choose);
    expect(screen.getByRole("menu", { name: "Replay mode" })).toBeTruthy();
    expect(
      screen.getByRole("menuitemradio", { name: "Step by step" }).getAttribute("aria-checked"),
    ).toBe("true");
    await user.click(screen.getByRole("menuitemradio", { name: "Autoplay" }));
    expect(onReplay).toHaveBeenCalledExactlyOnceWith("auto");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(choose);
    await user.click(screen.getByRole("button", { name: "Reproduce Autoplay" }));
    expect(onReplay.mock.calls).toEqual([["auto"], ["auto"]]);
  });
});
