import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Z_INDEX } from "../z-index";
import { PinLayer, type PinLayerPin } from ".";

const PINS: PinLayerPin[] = [
  { threadId: "t1", number: 1, status: "open", x: 10, y: 20, visible: true },
  { threadId: "t2", number: 2, status: "resolved", x: 30, y: 40, visible: true },
  { threadId: "t3", number: 3, status: "open", x: 50, y: 60, visible: false },
];

describe("PinLayer", () => {
  it("is an absolute, click-through layer anchored at the document origin", () => {
    render(<PinLayer pins={PINS} onSelectPin={vi.fn()} />);

    const layer = screen.getByRole("group", { name: "Comment pins" });

    expect(layer.className).toContain("absolute");
    expect(layer.className).toContain("top-0");
    expect(layer.className).toContain("left-0");
    expect(layer.className).toContain("pointer-events-none");
    expect(layer.className).not.toContain("fixed");
    expect(layer.style.zIndex).toBe(String(Z_INDEX.pins));
  });

  it("cancels the layer origin offset so pins use document coordinates", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 30,
      top: 40,
      width: 0,
      height: 0,
      right: 30,
      bottom: 40,
      x: 30,
      y: 40,
      toJSON: () => ({}),
    });
    Object.defineProperty(window, "scrollX", { value: 5, configurable: true });
    Object.defineProperty(window, "scrollY", { value: 7, configurable: true });

    render(<PinLayer pins={PINS} onSelectPin={vi.fn()} />);

    const layer = screen.getByRole("group", { name: "Comment pins" });

    expect((layer.firstElementChild as HTMLElement).style.transform).toBe(
      "translate(-35px, -47px)",
    );

    vi.restoreAllMocks();
    Object.defineProperty(window, "scrollX", { value: 0, configurable: true });
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });

  it("honors a raised stacking order for the whole layer", () => {
    render(<PinLayer pins={PINS} onSelectPin={vi.fn()} zIndex={2147483500} />);

    expect(screen.getByRole("group").style.zIndex).toBe("2147483500");
  });

  it("renders only visible pins, each with pointer events enabled", () => {
    render(<PinLayer pins={PINS} onSelectPin={vi.fn()} />);

    const layer = screen.getByRole("group");
    const buttons = within(layer).getAllByRole("button");

    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Thread 1, open",
      "Thread 2, resolved",
    ]);
    expect(buttons.every((button) => button.className.includes("pointer-events-auto"))).toBe(true);
    expect(screen.queryByRole("button", { name: /Thread 3/ })).toBeNull();
  });

  it("positions each pin at its coordinates", () => {
    render(<PinLayer pins={PINS} onSelectPin={vi.fn()} />);

    const pin = screen.getByRole("button", { name: "Thread 2, resolved" });

    expect(pin.style.left).toBe("18px");
    expect(pin.style.top).toBe("28px");
  });

  it("marks the active pin and reports selections by thread id", async () => {
    const user = userEvent.setup();
    const onSelectPin = vi.fn();
    render(<PinLayer pins={PINS} activeThreadId="t2" onSelectPin={onSelectPin} />);

    expect(
      screen.getByRole("button", { name: "Thread 2, resolved" }).getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Thread 1, open" }).getAttribute("aria-expanded"),
    ).toBe("false");

    await user.click(screen.getByRole("button", { name: "Thread 1, open" }));

    expect(onSelectPin).toHaveBeenCalledExactlyOnceWith("t1");
  });

  it("renders a pending pin as pending", () => {
    render(
      <PinLayer
        pins={[
          { threadId: "new", number: 4, status: "open", x: 1, y: 2, visible: true, pending: true },
        ]}
        onSelectPin={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Thread 4, pending" })).toBeTruthy();
  });

  it("renders an empty layer without pins", () => {
    render(<PinLayer pins={[]} onSelectPin={vi.fn()} />);

    expect(within(screen.getByRole("group")).queryAllByRole("button")).toHaveLength(0);
  });

  it("drops a pin when its visibility turns off", () => {
    const { rerender } = render(<PinLayer pins={PINS} onSelectPin={vi.fn()} />);

    rerender(
      <PinLayer
        pins={PINS.map((pin) => ({ ...pin, visible: pin.threadId === "t1" }))}
        onSelectPin={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
