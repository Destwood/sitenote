export interface PersonView {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface CommentView {
  id: string;
  author: PersonView;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  canEdit: boolean;
}

export type ThreadStatus = "open" | "resolved";

export interface ThreadView {
  id: string;
  status: ThreadStatus;
  number: number;
  author: PersonView;
  createdAt: string;
  comments: CommentView[];
  orphaned: boolean;
  anchorLabel: string;
}
