import type { CommentView, PersonView, ThreadView } from "../types";

export const ANN: PersonView = { id: "u-ann", displayName: "Ann Author", avatarUrl: null };
export const BOB: PersonView = { id: "u-bob", displayName: "Bob Reviewer", avatarUrl: null };

export function makeComment(overrides: Partial<CommentView> = {}): CommentView {
  return {
    id: "c1",
    author: ANN,
    body: "Looks good",
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    editedAt: null,
    deleted: false,
    canEdit: false,
    mentions: [],
    ...overrides,
  };
}

export function makeThread(overrides: Partial<ThreadView> = {}): ThreadView {
  return {
    id: "t1",
    status: "open",
    number: 1,
    author: ANN,
    createdAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    comments: [makeComment()],
    orphaned: false,
    anchorLabel: "button.checkout",
    ...overrides,
  };
}
