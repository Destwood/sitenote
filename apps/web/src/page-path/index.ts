const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function pagePathLabel(pageUrl: string): string {
  try {
    const url = new URL(pageUrl);
    return `${url.pathname}${url.search}`;
  } catch {
    return pageUrl;
  }
}

export function pagePathDisplay(pageUrl: string): string {
  try {
    const url = new URL(pageUrl);
    const pathname = url.pathname
      .split("/")
      .map((segment) => (UUID_SEGMENT.test(segment) ? "{id}" : segment))
      .join("/");
    return `${pathname}${url.search}`;
  } catch {
    return pageUrl;
  }
}
