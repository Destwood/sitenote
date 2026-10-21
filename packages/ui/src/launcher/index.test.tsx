import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Z_INDEX } from "../z-index";
import { Launcher } from ".";

describe("Launcher", () => {
  it("names the button with the number of open threads", () => {
    render(<Launcher openCount={3} expanded={false} onClick={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Comments, 3 open" });

    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.style.zIndex).toBe(String(Z_INDEX.launcher));
    expect(screen.getByTestId("sitenote-launcher-count").textContent).toBe("3");
  });

  it("shows zero open threads", () => {
    render(<Launcher openCount={0} expanded onClick={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Comments, 0 open" }).getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("is activated with the mouse and the keyboard and has a focus ring", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Launcher openCount={1} expanded={false} onClick={onClick} />);

    await user.click(screen.getByRole("button"));
    await user.keyboard("{Enter}");

    expect(onClick).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button").className).toContain("focus-visible:outline-2");
  });
});
