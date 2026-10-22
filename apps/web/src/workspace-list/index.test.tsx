import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkspaceList } from ".";

const OWNED = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Northwind",
  role: "owner",
} as const;
const JOINED = {
  id: "10000000-0000-4000-8000-000000000002",
  name: "Acme",
  role: "member",
} as const;
const GUESTING = {
  id: "10000000-0000-4000-8000-000000000003",
  name: "Client",
  role: "guest",
} as const;

function at<Item>(items: readonly Item[], index: number): Item {
  const item = items.at(index);
  if (item === undefined) {
    throw new Error(`No item at ${String(index)}`);
  }
  return item;
}

describe("WorkspaceList", () => {
  it("shows an empty state", () => {
    render(<WorkspaceList workspaces={[]} />);

    expect(screen.getByText("You are not in any workspace yet.")).toBeTruthy();
  });

  it("links to the invites page only from workspaces the user owns", () => {
    render(<WorkspaceList workspaces={[OWNED, JOINED, GUESTING]} />);

    const rows = screen.getAllByRole("listitem");
    const link = within(at(rows, 0)).getByRole("link", { name: "Invites" });
    expect(link.getAttribute("href")).toBe(`/app/w/${OWNED.id}/invites`);
    expect(within(at(rows, 1)).queryByRole("link")).toBeNull();
    expect(within(at(rows, 2)).queryByRole("link")).toBeNull();
    expect(within(at(rows, 0)).getByText("Owner")).toBeTruthy();
    expect(within(at(rows, 2)).getByText("Guest")).toBeTruthy();
  });
});
