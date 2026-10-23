import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../site-actions", () => ({ removeSite: vi.fn() }));

import { NO_SITES_TEXT, SiteList, type SiteListItem } from ".";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";

function at<Item>(items: readonly Item[], index: number): Item {
  const item = items.at(index);
  if (item === undefined) {
    throw new Error(`No item at ${String(index)}`);
  }
  return item;
}

const SITES: SiteListItem[] = [
  { id: "30000000-0000-4000-8000-000000000001", origin: "https://example.test", threadCount: 1 },
  { id: "30000000-0000-4000-8000-000000000002", origin: "http://127.0.0.1:4173", threadCount: 4 },
];

describe("SiteList", () => {
  it("shows the empty state", () => {
    render(<SiteList workspaceId={WORKSPACE_ID} sites={[]} canManage />);

    expect(screen.getByText(NO_SITES_TEXT)).toBeTruthy();
  });

  it("lists each origin with its thread count", () => {
    render(<SiteList workspaceId={WORKSPACE_ID} sites={SITES} canManage={false} />);

    const rows = screen.getAllByRole("listitem");
    expect(within(at(rows, 0)).getByText("https://example.test")).toBeTruthy();
    expect(within(at(rows, 0)).getByText("1 thread")).toBeTruthy();
    expect(within(at(rows, 1)).getByText("4 threads")).toBeTruthy();
  });

  it("offers removal only to whoever can manage the sites", () => {
    const { rerender } = render(
      <SiteList workspaceId={WORKSPACE_ID} sites={SITES} canManage={false} />,
    );
    expect(screen.queryByRole("button", { name: "Remove site" })).toBeNull();

    rerender(<SiteList workspaceId={WORKSPACE_ID} sites={SITES} canManage />);
    expect(screen.getAllByRole("button", { name: "Remove site" })).toHaveLength(2);
  });
});
