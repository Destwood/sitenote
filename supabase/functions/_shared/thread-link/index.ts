export function threadLink(siteUrl: string, threadId: string): string {
  return `${new URL(siteUrl).origin}/t/${threadId}`;
}
