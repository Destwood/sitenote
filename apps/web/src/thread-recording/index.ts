import type { SitenoteClient } from "@sitenote/db";
import type { ScreenshotState } from "@sitenote/ui";

export const RECORDING_BUCKET = "recordings";
export const RECORDING_URL_SECONDS = 60 * 60;

export async function readRecordingState(
  supabase: SitenoteClient,
  path: string,
): Promise<ScreenshotState> {
  const { data, error } = await supabase.storage
    .from(RECORDING_BUCKET)
    .createSignedUrl(path, RECORDING_URL_SECONDS);
  if (error !== null) {
    return { status: "unavailable" };
  }
  return { status: "ready", url: data.signedUrl };
}
