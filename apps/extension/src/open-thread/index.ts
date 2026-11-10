import { appendThreadHash, type ReplayMode } from "@sitenote/core";
import { browser } from "wxt/browser";

export interface ThreadTarget {
  pageUrl: string;
  threadId: string;
  replay?: ReplayMode;
}

export function isOpenable(pageUrl: string): boolean {
  const url = URL.parse(pageUrl);
  return url !== null && (url.protocol === "http:" || url.protocol === "https:");
}

export async function openThread(target: ThreadTarget): Promise<boolean> {
  const url = appendThreadHash(target.pageUrl, target.threadId, target.replay);
  if (url === null || !isOpenable(url)) {
    return false;
  }
  try {
    await browser.tabs.create({ url });
    return true;
  } catch {
    return false;
  }
}
