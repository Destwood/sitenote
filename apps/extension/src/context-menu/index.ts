export const COMMENT_ON_ELEMENT_MENU_ID = "sitenote-comment-on-element";
export const COMMENT_ON_ELEMENT_TITLE = "Comment on this element";
export const COMMENT_ON_ELEMENT_CONTEXTS = [
  "page",
  "image",
  "link",
  "video",
  "audio",
  "editable",
] as const;

export type CommentOnElementContext = (typeof COMMENT_ON_ELEMENT_CONTEXTS)[number];

export interface CommentOnElementItem {
  id: string;
  title: string;
  contexts: [CommentOnElementContext, ...CommentOnElementContext[]];
  documentUrlPatterns: string[];
}

export interface ContextMenuDeps {
  removeAll: () => Promise<void>;
  create: (properties: CommentOnElementItem) => void | Promise<void>;
  listOrigins: () => Promise<string[]>;
}

export interface ContextMenuClickInfo {
  menuItemId: string | number;
  frameId?: number | undefined;
}

export interface ContextMenuClickTab {
  id?: number | undefined;
}

export function originPattern(origin: string): string {
  return `${origin}/*`;
}

export function createContextMenuSync(deps: ContextMenuDeps): () => Promise<void> {
  let queue: Promise<unknown> = Promise.resolve();

  async function sync(): Promise<void> {
    await deps.removeAll();
    const origins = await deps.listOrigins();
    if (origins.length === 0) {
      return;
    }
    await deps.create({
      id: COMMENT_ON_ELEMENT_MENU_ID,
      title: COMMENT_ON_ELEMENT_TITLE,
      contexts: [...COMMENT_ON_ELEMENT_CONTEXTS],
      documentUrlPatterns: origins.map(originPattern),
    });
  }

  return () => {
    const next = queue.then(sync, sync);
    queue = next.catch(() => undefined);
    return next;
  };
}

export function createContextMenuClickListener(deps: {
  commentOnElement: (tabId: number) => Promise<unknown>;
}): (info: ContextMenuClickInfo, tab: ContextMenuClickTab | undefined) => void {
  return (info, tab) => {
    if (
      info.menuItemId === COMMENT_ON_ELEMENT_MENU_ID &&
      tab?.id !== undefined &&
      (info.frameId ?? 0) === 0
    ) {
      deps.commentOnElement(tab.id).catch(() => undefined);
    }
  };
}
