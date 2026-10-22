import { browser } from "wxt/browser";

export interface ThreadTarget {
  pageUrl: string;
  threadId: string;
}

export function isOpenable(pageUrl: string): boolean {
  const url = URL.parse(pageUrl);
  return url !== null && (url.protocol === "http:" || url.protocol === "https:");
}

export async function openThread(target: ThreadTarget): Promise<boolean> {
  if (!isOpenable(target.pageUrl)) {
    return false;
  }
  try {
    await browser.tabs.create({ url: target.pageUrl });
    return true;
  } catch {
    return false;
  }
}
