import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { SplitButton, type SplitButtonProps } from ".";

const OPTIONS = [
  { value: "start", label: "At start" },
  { value: "end", label: "At end" },
] as const;

function setup(props: Partial<SplitButtonProps<"start" | "end">> = {}) {
  const onAction = vi.fn();
  const onSelect = vi.fn();
  function Example() {
    const [value, setValue] = useState<"start" | "end">("start");
    return (
      <SplitButton
        value={value}
        options={OPTIONS}
        onAction={onAction}
        onSelect={(next) => {
          setValue(next);
          onSelect(next);
        }}
        chooseLabel="Choose placement"
        menuLabel="Placement"
        menuTitle="Attach comment"
        {...props}
      >
        Record
      </SplitButton>
    );
  }
  const view = render(<Example />);
  return {
    ...view,
    onAction,
    onSelect,
    choose: screen.getByRole("button", { name: "Choose placement" }),
  };
}

describe("SplitButton", () => {
  it("separates the action from radio selection and returns focus", async () => {
    const user = userEvent.setup();
    const { choose, onAction, onSelect } = setup();
    await user.click(screen.getByRole("button", { name: "Record" }));
    expect(onAction).toHaveBeenCalledOnce();
    await user.click(choose);
    expect(screen.getByText("Attach comment")).toBeTruthy();
    expect(screen.getByRole("menu", { name: "Placement" }).id).toBe(
      choose.getAttribute("aria-controls"),
    );
    expect(
      screen.getByRole("menuitemradio", { name: "At start" }).getAttribute("aria-checked"),
    ).toBe("true");
    await user.click(screen.getByRole("menuitemradio", { name: "At end" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("end");
    expect(onAction).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(choose);
    expect(choose.getAttribute("aria-expanded")).toBe("false");
    await user.click(choose);
    expect(screen.getByRole("menuitemradio", { name: "At end" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(document.activeElement).toBe(screen.getByRole("menuitemradio", { name: "At end" }));
  });

  it("opens by keyboard, wraps arrow navigation and selects with Enter", async () => {
    const user = userEvent.setup();
    const { choose, onSelect } = setup();
    choose.focus();
    await user.keyboard("{Enter}");
    const start = screen.getByRole("menuitemradio", { name: "At start" });
    const end = screen.getByRole("menuitemradio", { name: "At end" });
    expect(document.activeElement).toBe(start);
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(end);
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(start);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("end");
    expect(document.activeElement).toBe(choose);
  });

  it("closes on Escape with focus return and on Tab without selecting", async () => {
    const user = userEvent.setup();
    const { choose, onSelect } = setup();
    await user.click(choose);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(choose);
    await user.click(choose);
    await user.tab();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("uses the composed path for inside clicks and closes on outside clicks", async () => {
    const { choose, onSelect } = setup();
    await userEvent.click(choose);
    const event = new Event("pointerdown", { bubbles: true, composed: true });
    Object.defineProperty(event, "composedPath", {
      value: () => [choose, choose.parentElement, document],
    });
    fireEvent(document, event);
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps the menu open for retargeted pointer events inside a shadow root", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    shadow.append(container);
    const { unmount } = render(
      <SplitButton
        value="start"
        options={OPTIONS}
        onAction={vi.fn()}
        onSelect={vi.fn()}
        chooseLabel="Choose placement"
        menuLabel="Placement"
      >
        Record
      </SplitButton>,
      { container },
    );
    const queries = within(container);
    try {
      await userEvent.click(queries.getByRole("button", { name: "Choose placement" }));
      fireEvent.pointerDown(queries.getByRole("menuitemradio", { name: "At start" }), {
        bubbles: true,
        composed: true,
      });
      expect(queries.getByRole("menu")).toBeTruthy();
      fireEvent.pointerDown(document.body);
      expect(queries.queryByRole("menu")).toBeNull();
    } finally {
      unmount();
      host.remove();
    }
  });

  it("disables both buttons and hides an open menu while disabled", async () => {
    const { choose, onAction, onSelect, rerender } = setup({ disabled: true });
    expect(choose.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Record" }).hasAttribute("disabled")).toBe(true);
    await userEvent.click(choose);
    await userEvent.click(screen.getByRole("button", { name: "Record" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    rerender(
      <SplitButton
        value="start"
        options={OPTIONS}
        onAction={onAction}
        onSelect={onSelect}
        chooseLabel="Choose placement"
        menuLabel="Placement"
      >
        Record
      </SplitButton>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Choose placement" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    rerender(
      <SplitButton
        value="start"
        options={OPTIONS}
        onAction={onAction}
        onSelect={onSelect}
        chooseLabel="Choose placement"
        menuLabel="Placement"
        disabled
      >
        Record
      </SplitButton>,
    );
    expect(screen.queryByRole("menu")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Choose placement" }).getAttribute("aria-expanded"),
    ).toBe("false");
  });
});
