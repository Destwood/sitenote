import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: mocks.pathname,
}));

import { WorkspaceSwitcher } from ".";

const FIRST = { id: "10000000-0000-4000-8000-000000000001", name: "Northwind" };
const SECOND = { id: "10000000-0000-4000-8000-000000000002", name: "Acme" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname.mockReturnValue(`/app/w/${FIRST.id}/sites`);
});

describe("WorkspaceSwitcher", () => {
  it("shows the current workspace on a button named Workspace", () => {
    render(<WorkspaceSwitcher currentId={FIRST.id} workspaces={[FIRST, SECOND]} />);

    const trigger = screen.getByRole("button", { name: "Workspace" });
    expect(trigger.textContent).toContain("Northwind");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("lists the workspaces and marks the current one as selected", async () => {
    const user = userEvent.setup();
    render(<WorkspaceSwitcher currentId={FIRST.id} workspaces={[FIRST, SECOND]} />);

    await user.click(screen.getByRole("button", { name: "Workspace" }));

    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Northwind" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("option", { name: "Acme" }).getAttribute("aria-selected")).toBe(
      "false",
    );
  });

  it("opens the same section of the chosen workspace", async () => {
    const user = userEvent.setup();
    render(<WorkspaceSwitcher currentId={FIRST.id} workspaces={[FIRST, SECOND]} />);

    await user.click(screen.getByRole("button", { name: "Workspace" }));
    await user.click(screen.getByRole("option", { name: "Acme" }));

    expect(mocks.push).toHaveBeenCalledWith(`/app/w/${SECOND.id}/sites`);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("does not navigate when the current workspace is chosen again", async () => {
    const user = userEvent.setup();
    render(<WorkspaceSwitcher currentId={FIRST.id} workspaces={[FIRST, SECOND]} />);

    await user.click(screen.getByRole("button", { name: "Workspace" }));
    await user.click(screen.getByRole("option", { name: "Northwind" }));

    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("moves with the arrow keys and chooses with Enter", async () => {
    const user = userEvent.setup();
    render(<WorkspaceSwitcher currentId={FIRST.id} workspaces={[FIRST, SECOND]} />);

    screen.getByRole("button", { name: "Workspace" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("Northwind");

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toBe("Acme");

    await user.keyboard("{Enter}");
    expect(mocks.push).toHaveBeenCalledWith(`/app/w/${SECOND.id}/sites`);
  });

  it("closes with Escape and returns the focus to the button", async () => {
    const user = userEvent.setup();
    render(<WorkspaceSwitcher currentId={FIRST.id} workspaces={[FIRST, SECOND]} />);
    const trigger = screen.getByRole("button", { name: "Workspace" });

    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when the user clicks outside", async () => {
    const user = userEvent.setup();
    render(<WorkspaceSwitcher currentId={FIRST.id} workspaces={[FIRST, SECOND]} />);

    await user.click(screen.getByRole("button", { name: "Workspace" }));
    await user.click(document.body);

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
