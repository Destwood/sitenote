import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WorkspacePicker } from ".";

const OPTIONS = [
  { id: "w-1", name: "Northwind" },
  { id: "w-2", name: "AthleteLink" },
  { id: "w-3", name: "Agency" },
];

function renderPicker(overrides: Partial<Parameters<typeof WorkspacePicker>[0]> = {}) {
  const onChange = vi.fn();
  const onParentKeyDown = vi.fn();
  render(
    <div onKeyDown={onParentKeyDown}>
      <WorkspacePicker
        value="w-1"
        options={OPTIONS}
        onChange={onChange}
        disabled={false}
        {...overrides}
      />
      <button type="button">Outside</button>
    </div>,
  );
  return { onChange, onParentKeyDown };
}

function trigger() {
  return screen.getByRole("button", { name: /Workspace/ });
}

describe("WorkspacePicker", () => {
  it("shows the selected workspace on a closed trigger with listbox aria attributes", () => {
    renderPicker();

    const button = trigger();
    expect(button.textContent).toContain("Northwind");
    expect(button.getAttribute("aria-haspopup")).toBe("listbox");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens inline and lists every workspace with the selected one marked", async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(trigger());

    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("listbox", { name: "Workspace" })).toBeTruthy();
    expect(screen.getAllByRole("option")).toHaveLength(3);
    expect(screen.getByRole("option", { name: "Northwind" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("option", { name: "AthleteLink" }).getAttribute("aria-selected")).toBe(
      "false",
    );
  });

  it("selects an option on click, calls onChange and closes", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();
    await user.click(trigger());

    await user.click(screen.getByRole("option", { name: "AthleteLink" }));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("w-2");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("moves the active option with arrows, Home and End and selects it with Enter", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();
    await user.click(trigger());
    const listbox = screen.getByRole("listbox");
    expect(document.activeElement).toBe(listbox);

    await user.keyboard("{ArrowDown}");
    expect(listbox.getAttribute("aria-activedescendant")).toBe(
      screen.getAllByRole("option")[1]?.id,
    );
    await user.keyboard("{End}");
    expect(listbox.getAttribute("aria-activedescendant")).toBe(
      screen.getAllByRole("option")[2]?.id,
    );
    await user.keyboard("{Home}{ArrowUp}");
    expect(listbox.getAttribute("aria-activedescendant")).toBe(
      screen.getAllByRole("option")[0]?.id,
    );
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("w-2");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens from the keyboard with ArrowDown and selects with Space", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();
    trigger().focus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeTruthy();
    await user.keyboard("{ArrowDown}{ArrowDown} ");

    expect(onChange).toHaveBeenCalledWith("w-3");
  });

  it("closes on Escape, returns focus to the trigger and does not bubble the key", async () => {
    const user = userEvent.setup();
    const { onChange, onParentKeyDown } = renderPicker();
    await user.click(trigger());

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(onChange).not.toHaveBeenCalled();
    expect(onParentKeyDown).not.toHaveBeenCalled();
  });

  it("closes on Tab without selecting", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();
    await user.click(trigger());

    await user.keyboard("{Tab}");

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes when the user clicks outside", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();
    await user.click(trigger());

    await user.click(screen.getByRole("button", { name: "Outside" }));

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not open when disabled", async () => {
    const user = userEvent.setup();
    renderPicker({ disabled: true });

    expect(trigger().hasAttribute("disabled")).toBe(true);
    await user.click(trigger());

    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
