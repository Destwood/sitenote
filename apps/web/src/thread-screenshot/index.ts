import type { SitenoteClient } from "@sitenote/db";
import type { ScreenshotState } from "@sitenote/ui";

export const SCREENSHOT_BUCKET = "screenshots";
export const SCREENSHOT_URL_SECONDS = 60 * 60;

export async function readScreenshotState(
  supabase: SitenoteClient,
  path: string,
): Promise<ScreenshotState> {
  const { data, error } = await supabase.storage
    .from(SCREENSHOT_BUCKET)
    .createSignedUrl(path, SCREENSHOT_URL_SECONDS);
  if (error !== null) {
    return { status: "unavailable" };
  }
  return { status: "ready", url: data.signedUrl };
}
