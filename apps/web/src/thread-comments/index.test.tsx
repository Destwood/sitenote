import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FORMER_MEMBER_LABEL } from "../thread-table";
import type { WorkspaceMember } from "../workspace-members";
import {
  DELETED_COMMENT_TEXT,
  NO_COMMENTS_TEXT,
  ThreadComments,
  toCommentViews,
  type CommentRow,
} from ".";

const OLENA: WorkspaceMember = {
  userId: "u-1",
  displayName: "Olena",
  role: "owner",
  joinedAt: "2026-10-01T09:00:00Z",
};
const MAX: WorkspaceMember = {
  userId: "u-2",
  displayName: "Max",
  role: "member",
  joinedAt: "2026-10-02T09:00:00Z",
};

function row(overrides: Partial<CommentRow>): CommentRow {
  return {
    id: "c-1",
    author_id: "u-1",
    body: "Hello",
    mentions: [],
    created_at: "2026-10-22T09:00:00Z",
    edited_at: null,
    deleted_at: null,
    ...overrides,
  };
}

describe("toCommentViews", () => {
  it("names the author and keeps only the mentions of current members", () => {
    const [view] = toCommentViews(
      [row({ body: "@Max look", mentions: ["u-2", "u-9"] })],
      [OLENA, MAX],
    );

    expect(view?.authorName).toBe("Olena");
    expect(view?.mentions).toEqual([{ id: "u-2", displayName: "Max" }]);
    expect(view?.deleted).toBe(false);
  });

  it("labels a comment whose author is gone and marks deleted comments", () => {
    const [gone, deleted] = toCommentViews(
      [row({ id: "c-2", author_id: null }), row({ id: "c-3", deleted_at: "2026-10-22T10:00:00Z" })],
      [OLENA],
    );

    expect(gone?.authorName).toBe(FORMER_MEMBER_LABEL);
    expect(deleted?.deleted).toBe(true);
  });
});

describe("ThreadComments", () => {
  it("shows the empty state", () => {
    render(<ThreadComments comments={[]} />);

    expect(screen.getByText(NO_COMMENTS_TEXT)).toBeTruthy();
  });

  it("highlights mentions and renders markup in a body as plain text", () => {
    const [view] = toCommentViews(
      [row({ body: "<b>hi</b> @Max see", mentions: ["u-2"] })],
      [OLENA, MAX],
    );
    const { container } = render(<ThreadComments comments={view ? [view] : []} />);

    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<b>hi</b> ");
    expect(container.querySelector('[data-mention="u-2"]')?.textContent).toBe("@Max");
  });

  it("shows a deleted comment without its text", () => {
    const [view] = toCommentViews([row({ body: "", deleted_at: "2026-10-22T10:00:00Z" })], [OLENA]);
    render(<ThreadComments comments={view ? [view] : []} />);

    expect(screen.getByText(DELETED_COMMENT_TEXT)).toBeTruthy();
  });
});
