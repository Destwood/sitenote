import { parsePageUrl } from "@sitenote/core";
import { browser } from "wxt/browser";

const UNSUPPORTED_HOSTS: ReadonlySet<string> = new Set([
  "chromewebstore.google.com",
  "chrome.google.com",
  "microsoftedge.microsoft.com",
]);

export interface TargetTab {
  id: number;
  origin: string | null;
}

export function originOfTabUrl(url: string | undefined): string | null {
  const page = url === undefined ? null : parsePageUrl(url);
  if (page === null || UNSUPPORTED_HOSTS.has(new URL(page.site).hostname)) {
    return null;
  }
  return page.site;
}

function tabIdFromSearch(search: string): number | null {
  const raw = new URLSearchParams(search).get("tabId");
  const id = raw === null || raw === "" ? Number.NaN : Number(raw);
  return Number.isInteger(id) && id >= 0 ? id : null;
}

export async function getTargetTab(search: string): Promise<TargetTab | null> {
  try {
    const requested = tabIdFromSearch(search);
    const tab =
      requested === null
        ? (await browser.tabs.query({ active: true, currentWindow: true }))[0]
        : await browser.tabs.get(requested);
    return tab?.id === undefined ? null : { id: tab.id, origin: originOfTabUrl(tab.url) };
  } catch {
    return null;
  }
}

function patternOf(origin: string): { origins: string[] } {
  return { origins: [`${origin}/*`] };
}

export async function hasOriginAccess(origin: string): Promise<boolean> {
  try {
    return await browser.permissions.contains(patternOf(origin));
  } catch {
    return false;
  }
}

export async function requestOriginAccess(origin: string): Promise<boolean> {
  try {
    return await browser.permissions.request(patternOf(origin));
  } catch {
    return false;
  }
}

export async function removeOriginAccess(origin: string): Promise<void> {
  await browser.permissions.remove(patternOf(origin)).catch(() => false);
}

const ORIGIN_PATTERN = /^https?:\/\/[^*/]+\/\*$/;

export async function listOriginAccess(): Promise<string[]> {
  try {
    const { origins = [] } = await browser.permissions.getAll();
    return origins
      .filter((pattern) => ORIGIN_PATTERN.test(pattern))
      .map((pattern) => pattern.slice(0, -"/*".length))
      .sort();
  } catch {
    return [];
  }
}
