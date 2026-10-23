import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ThreadRow } from "../thread-search";
import { FORMER_MEMBER_LABEL, NO_MATCHES_TEXT, NO_THREADS_TEXT, ThreadTable } from ".";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const THREAD_ID = "20000000-0000-4000-8000-000000000001";
const NAMES: ReadonlyMap<string, string> = new Map([["u-1", "Olena Owner"]]);

const ROW: ThreadRow = {
  id: THREAD_ID,
  pageUrl: "https://example.test/pricing?plan=pro",
  status: "open",
  createdBy: "u-1",
  createdAt: "2026-10-22T09:00:00Z",
  commentCount: 3,
  lastActivity: "2026-10-22T10:30:00Z",
  firstBody: "<img src=x onerror=alert(1)> The price is unclear",
};

describe("ThreadTable", () => {
  it("shows the empty state of a workspace without threads", () => {
    render(<ThreadTable workspaceId={WORKSPACE_ID} rows={[]} names={NAMES} filtered={false} />);

    expect(screen.getByText(NO_THREADS_TEXT)).toBeTruthy();
  });

  it("shows the empty state of a search without matches", () => {
    render(<ThreadTable workspaceId={WORKSPACE_ID} rows={[]} names={NAMES} filtered />);

    expect(screen.getByText(NO_MATCHES_TEXT)).toBeTruthy();
  });

  it("shows each thread with its page, author, status, counts and times", () => {
    render(<ThreadTable workspaceId={WORKSPACE_ID} rows={[ROW]} names={NAMES} filtered={false} />);

    const row = screen.getAllByRole("row")[1];
    if (row === undefined) {
      throw new Error("The thread row is missing");
    }
    expect(within(row).getByRole("link", { name: "/pricing?plan=pro" }).getAttribute("href")).toBe(
      `/app/w/${WORKSPACE_ID}/threads/${THREAD_ID}`,
    );
    expect(within(row).getByText("Olena Owner")).toBeTruthy();
    expect(within(row).getByText("Open")).toBeTruthy();
    expect(within(row).getByText("3")).toBeTruthy();
    expect(within(row).getByText("22 Oct 2026, 09:00 UTC")).toBeTruthy();
    expect(within(row).getByText("22 Oct 2026, 10:30 UTC")).toBeTruthy();
  });

  it("renders the first comment as text, never as markup", () => {
    const { container } = render(
      <ThreadTable workspaceId={WORKSPACE_ID} rows={[ROW]} names={NAMES} filtered={false} />,
    );

    expect(screen.getByText(/The price is unclear/)).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("labels the author of a thread who is no longer a member", () => {
    render(
      <ThreadTable
        workspaceId={WORKSPACE_ID}
        rows={[{ ...ROW, createdBy: "u-gone" }]}
        names={NAMES}
        filtered={false}
      />,
    );

    expect(screen.getByText(FORMER_MEMBER_LABEL)).toBeTruthy();
  });
});
