import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Z_INDEX } from "../z-index";
import { TOAST_AUTO_DISMISS_MS, Toast, ToastRegion, type ToastView } from ".";

const INFO: ToastView = { id: "a", message: "Comment saved", variant: "info" };
const ERROR: ToastView = { id: "b", message: "Could not save", variant: "error" };

afterEach(() => {
  vi.useRealTimers();
});

describe("ToastRegion", () => {
  it("is a polite status region that exists even without toasts", () => {
    render(<ToastRegion toasts={[]} onDismiss={vi.fn()} />);

    const region = screen.getByRole("status");

    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.children).toHaveLength(0);
    expect(region.style.zIndex).toBe(String(Z_INDEX.toast));
    expect(region.className).toContain("pointer-events-none");
  });

  it("renders every toast inside the region", () => {
    render(<ToastRegion toasts={[INFO, ERROR]} onDismiss={vi.fn()} />);

    const region = screen.getByRole("status");

    expect(region.textContent).toContain("Comment saved");
    expect(region.textContent).toContain("Error: Could not save");
  });

  it("dismisses a toast by id from its button", () => {
    const onDismiss = vi.fn();
    render(<ToastRegion toasts={[INFO, ERROR]} onDismiss={onDismiss} />);

    const buttons = screen.getAllByRole("button", { name: "Dismiss notification" });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons.at(1) ?? document.body);

    expect(onDismiss).toHaveBeenCalledExactlyOnceWith("b");
  });
});

describe("Toast", () => {
  it("dismisses an info toast after the timeout", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast toast={INFO} onDismiss={onDismiss} />);

    act(() => {
      vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS - 1);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith("a");
  });

  it("never auto-dismisses an error", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast toast={ERROR} onDismiss={onDismiss} />);

    act(() => {
      vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS * 10);
    });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("pauses the timer while hovered and restarts it afterwards", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast toast={INFO} onDismiss={onDismiss} />);
    const message = screen.getByText("Comment saved");

    fireEvent.mouseEnter(message);
    act(() => {
      vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS * 2);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.mouseLeave(message);
    act(() => {
      vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("pauses the timer while focus is inside", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<Toast toast={INFO} onDismiss={onDismiss} />);
    const button = screen.getByRole("button", { name: "Dismiss notification" });

    act(() => {
      button.focus();
    });
    act(() => {
      vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS * 2);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      button.blur();
    });
    act(() => {
      vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows Retry only for an error with a retry handler and dismisses after retrying", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    const { rerender } = render(<Toast toast={ERROR} onDismiss={onDismiss} />);

    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();

    rerender(<Toast toast={{ ...ERROR, onRetry }} onDismiss={onDismiss} />);
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith("b");
  });

  it("renders the message as text", () => {
    render(
      <Toast toast={{ ...INFO, message: "<img src=x onerror=alert(1)>" }} onDismiss={vi.fn()} />,
    );

    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });

  it("marks the variant", () => {
    const { container } = render(<Toast toast={ERROR} onDismiss={vi.fn()} />);

    expect(container.firstElementChild?.getAttribute("data-variant")).toBe("error");
  });
});
