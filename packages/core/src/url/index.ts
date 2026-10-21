export interface PageUrl {
  site: string;
  page: string;
}

export function parsePageUrl(input: string): PageUrl | null {
  const url = URL.parse(input);
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    return null;
  }
  return { site: url.origin, page: url.origin + url.pathname.replace(/\/+$/, "") };
}
