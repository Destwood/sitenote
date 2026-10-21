import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VIEWPORT_MARGIN } from "../placement";
import { Z_INDEX } from "../z-index";
import { SELECTION_BUTTON_SIZE, SelectionButton } from ".";

const initial = { width: window.innerWidth, height: window.innerHeight };

afterEach(() => {
  window.innerWidth = initial.width;
  window.innerHeight = initial.height;
});

describe("SelectionButton", () => {
  it("floats above the centre of the selection", () => {
    render(<SelectionButton rect={{ x: 200, y: 300, width: 100, height: 20 }} onClick={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Comment" });

    expect(button.style.left).toBe(`${String(250 - SELECTION_BUTTON_SIZE.width / 2)}px`);
    expect(button.style.top).toBe(`${String(300 - 8 - SELECTION_BUTTON_SIZE.height)}px`);
    expect(button.style.zIndex).toBe(String(Z_INDEX.selectionButton));
    expect(button.className).toContain("fixed");
  });

  it("flips below a selection at the top edge", () => {
    render(<SelectionButton rect={{ x: 200, y: 5, width: 100, height: 20 }} onClick={vi.fn()} />);

    expect(screen.getByRole("button").style.top).toBe("33px");
  });

  it("stays inside the viewport near the left edge", () => {
    render(<SelectionButton rect={{ x: 0, y: 300, width: 10, height: 20 }} onClick={vi.fn()} />);

    expect(screen.getByRole("button").style.left).toBe(`${String(VIEWPORT_MARGIN)}px`);
  });

  it("re-clamps when the window shrinks", () => {
    render(<SelectionButton rect={{ x: 900, y: 300, width: 50, height: 20 }} onClick={vi.fn()} />);

    act(() => {
      window.innerWidth = 500;
      window.dispatchEvent(new Event("resize"));
    });

    expect(screen.getByRole("button").style.left).toBe(
      `${String(500 - SELECTION_BUTTON_SIZE.width - VIEWPORT_MARGIN)}px`,
    );
  });

  it("calls onClick from the mouse and the keyboard", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<SelectionButton rect={{ x: 200, y: 300, width: 100, height: 20 }} onClick={onClick} />);

    await user.click(screen.getByRole("button"));
    await user.tab();
    await user.keyboard("{Enter}");

    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("does not take focus or clear the selection on mouse down", () => {
    render(<SelectionButton rect={{ x: 200, y: 300, width: 100, height: 20 }} onClick={vi.fn()} />);

    const notPrevented = fireEvent.mouseDown(screen.getByRole("button"));

    expect(notPrevented).toBe(false);
  });
});
