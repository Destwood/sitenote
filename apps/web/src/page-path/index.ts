export function pagePathLabel(pageUrl: string): string {
  try {
    const url = new URL(pageUrl);
    return `${url.pathname}${url.search}`;
  } catch {
    return pageUrl;
  }
}
