import * as z from "zod/mini";

export const EXTENSION_DOWNLOAD_URL =
  "https://github.com/Destwood/sitenote/releases/download/extension-latest/sitenote-extension.zip";
export const EXTENSION_RELEASE_API_URL =
  "https://api.github.com/repos/Destwood/sitenote/releases/tags/extension-latest";

const releaseSchema = z.object({ name: z.string() });

export function parseExtensionVersion(text: string): string | null {
  return /\d+\.\d+\.\d+/.exec(text)?.[0] ?? null;
}

export function isNewerVersion(installed: string, latest: string): boolean {
  const current = parseExtensionVersion(installed);
  const next = parseExtensionVersion(latest);
  if (current === null || next === null) {
    return false;
  }
  const currentParts = current.split(".").map(Number);
  const nextParts = next.split(".").map(Number);
  for (let index = 0; index < Math.max(currentParts.length, nextParts.length); index += 1) {
    const installedPart = currentParts[index] ?? 0;
    const latestPart = nextParts[index] ?? 0;
    if (installedPart !== latestPart) {
      return latestPart > installedPart;
    }
  }
  return false;
}

export async function fetchLatestExtensionVersion(
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const response = await fetcher(EXTENSION_RELEASE_API_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) {
      return null;
    }
    const body: unknown = await response.json();
    const parsed = releaseSchema.safeParse(body);
    return parsed.success ? parseExtensionVersion(parsed.data.name) : null;
  } catch {
    return null;
  }
}
