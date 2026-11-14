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
  hasRecording: false,
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

  it("shows the columns in order, starting with the domain and the route", () => {
    render(<ThreadTable workspaceId={WORKSPACE_ID} rows={[ROW]} names={NAMES} filtered={false} />);

    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Domain",
      "Route",
      "First comment",
      "Type",
      "Author",
      "Status",
      "Comments",
      "Created",
      "Last activity",
    ]);
  });

  it("shows a thread with a recording as a video and the others as text", () => {
    render(
      <ThreadTable
        workspaceId={WORKSPACE_ID}
        rows={[ROW, { ...ROW, id: "20000000-0000-4000-8000-000000000002", hasRecording: true }]}
        names={NAMES}
        filtered={false}
      />,
    );

    const rows = screen.getAllByRole("row");
    const text = rows[1];
    const video = rows[2];
    if (text === undefined || video === undefined) {
      throw new Error("The thread rows are missing");
    }
    expect(within(text).getByText("Text")).toBeTruthy();
    expect(within(video).getByText("Video")).toBeTruthy();
  });

  it("shows each thread with its domain, route, author, status, counts and times", () => {
    render(<ThreadTable workspaceId={WORKSPACE_ID} rows={[ROW]} names={NAMES} filtered={false} />);

    const row = screen.getAllByRole("row")[1];
    if (row === undefined) {
      throw new Error("The thread row is missing");
    }
    expect(within(row).getByText("example.test")).toBeTruthy();
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

  it("masks UUID segments of the route and reveals the real path on hover", () => {
    const pageId = "9f1c2b3a-4d5e-4f60-8a7b-1c2d3e4f5a6b";
    render(
      <ThreadTable
        workspaceId={WORKSPACE_ID}
        rows={[{ ...ROW, pageUrl: `https://example.test/pages/${pageId}?plan=pro` }]}
        names={NAMES}
        filtered={false}
      />,
    );

    const link = screen.getByRole("link", { name: "/pages/{id}?plan=pro" });
    expect(link.getAttribute("title")).toBe(`/pages/${pageId}?plan=pro`);
  });

  it("gives every column header a resize handle", () => {
    render(<ThreadTable workspaceId={WORKSPACE_ID} rows={[ROW]} names={NAMES} filtered={false} />);

    const separators = screen.getAllByRole("separator");
    expect(separators).toHaveLength(9);
    expect(separators[0]?.getAttribute("aria-label")).toBe("Resize Domain column");
    expect(separators[8]?.getAttribute("aria-label")).toBe("Resize Last activity column");
  });
});
