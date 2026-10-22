export function toOpenableOrigin(origin: string): string | null {
  const url = URL.parse(origin);
  if (url === null || (url.protocol !== "http:" && url.protocol !== "https:")) {
    return null;
  }
  return url.origin;
}
