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
  it("lists the workspaces and selects the current one", () => {
    render(<WorkspaceSwitcher currentId={FIRST.id} workspaces={[FIRST, SECOND]} />);

    const select = screen.getByLabelText("Workspace");
    expect(screen.getByRole("option", { name: "Acme" })).toBeTruthy();
    expect((select as HTMLSelectElement).value).toBe(FIRST.id);
  });

  it("opens the same section of the chosen workspace", async () => {
    const user = userEvent.setup();
    render(<WorkspaceSwitcher currentId={FIRST.id} workspaces={[FIRST, SECOND]} />);

    await user.selectOptions(screen.getByLabelText("Workspace"), SECOND.id);

    expect(mocks.push).toHaveBeenCalledWith(`/app/w/${SECOND.id}/sites`);
  });
});
