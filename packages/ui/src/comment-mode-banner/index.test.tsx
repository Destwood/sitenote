import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Z_INDEX } from "../z-index";
import { CommentModeBanner } from ".";

describe("CommentModeBanner", () => {
  it("announces comment mode with the instructions", () => {
    render(<CommentModeBanner onExit={vi.fn()} />);

    const banner = screen.getByRole("status");

    expect(banner.textContent).toContain(
      "Comment mode: click an element or select text · Esc to exit",
    );
    expect(banner.style.zIndex).toBe(String(Z_INDEX.banner));
    expect(banner.className).toContain("fixed");
  });

  it("exits from the button with the mouse and the keyboard", async () => {
    const user = userEvent.setup();
    const onExit = vi.fn();
    render(<CommentModeBanner onExit={onExit} />);

    await user.click(screen.getByRole("button", { name: "Exit" }));
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onExit).toHaveBeenCalledTimes(3);
  });

  it("is reachable with Tab and shows a visible focus ring", async () => {
    const user = userEvent.setup();
    render(<CommentModeBanner onExit={vi.fn()} />);

    await user.tab();
    const button = screen.getByRole("button", { name: "Exit" });

    expect(document.activeElement).toBe(button);
    expect(button.className).toContain("focus-visible:outline-2");
  });
});
