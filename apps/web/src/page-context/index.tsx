"use client";

import { formatThreadContextMarkdown, type Anchor } from "@sitenote/core";
import { ContextSection, type ContextSectionProps } from "@sitenote/ui";

export interface PageContextThread {
  excerpt: string;
  authorName: string;
  status: "open" | "resolved";
  pageUrl: string;
  anchor: Anchor | null;
}

interface PageContextProps extends Omit<ContextSectionProps, "onCopyContext"> {
  thread?: PageContextThread | undefined;
}

async function copyContext(
  thread: PageContextThread,
  context: ContextSectionProps["context"],
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(
      formatThreadContextMarkdown({
        excerpt: thread.excerpt,
        authorName: thread.authorName,
        status: thread.status,
        threadUrl: window.location.href,
        pageUrl: thread.pageUrl,
        context,
        anchor: thread.anchor,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function PageContext({ thread, ...props }: PageContextProps) {
  const onCopyContext = thread === undefined ? undefined : () => copyContext(thread, props.context);
  return <ContextSection {...props} onCopyContext={onCopyContext} />;
}
