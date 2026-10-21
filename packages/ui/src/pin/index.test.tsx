import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PIN_SIZE, Pin, type PinProps } from ".";

function renderPin(props: Partial<PinProps> = {}) {
  const onSelect = vi.fn();
  render(<Pin number={3} status="open" x={100} y={200} onSelect={onSelect} {...props} />);
  return { onSelect };
}

describe("Pin", () => {
  it("is a button labelled with its number and status", () => {
    renderPin();

    const pin = screen.getByRole("button", { name: "Thread 3, open" });

    expect(pin.textContent).toBe("3");
    expect(pin.getAttribute("data-state")).toBe("open");
    expect(pin.getAttribute("aria-expanded")).toBe("false");
    expect(pin.getAttribute("aria-haspopup")).toBe("dialog");
  });

  it("is centred on its coordinates and is 24 px", () => {
    renderPin({ x: 100, y: 200 });

    const style = screen.getByRole("button").style;

    expect(PIN_SIZE).toBe(24);
    expect(style.left).toBe("88px");
    expect(style.top).toBe("188px");
    expect(style.width).toBe("24px");
    expect(style.height).toBe("24px");
  });

  it("reports the resolved state in its label and styling", () => {
    renderPin({ status: "resolved" });

    const pin = screen.getByRole("button", { name: "Thread 3, resolved" });

    expect(pin.className).toContain("bg-neutral-600");
    expect(pin.className).not.toContain("bg-blue-700");
  });

  it("marks an active pin as expanded and rings it", () => {
    renderPin({ active: true });

    const pin = screen.getByRole("button");

    expect(pin.getAttribute("aria-expanded")).toBe("true");
    expect(pin.className).toContain("ring-2");
  });

  it("describes a pending pin as pending regardless of status", () => {
    renderPin({ pending: true });

    const pin = screen.getByRole("button", { name: "Thread 3, pending" });

    expect(pin.getAttribute("data-state")).toBe("pending");
    expect(pin.className).toContain("border-dashed");
  });

  it("calls onSelect on click, Enter and Space", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderPin();

    await user.click(screen.getByRole("button"));
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it("opts into pointer events so it works inside a click-through layer", () => {
    renderPin();

    expect(screen.getByRole("button").className).toContain("pointer-events-auto");
  });

  it("only animates for users who allow motion", () => {
    renderPin();

    const classes = screen.getByRole("button").className.split(" ");

    expect(classes).toContain("motion-safe:transition-transform");
    expect(
      classes
        .filter((name) => name.includes("transition"))
        .every((name) => name.startsWith("motion-safe:")),
    ).toBe(true);
  });
});
