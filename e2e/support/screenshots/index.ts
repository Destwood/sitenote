import type { Page } from "@playwright/test";
import { parseThreadContext, type ThreadContext } from "@sitenote/core";
import type { SitenoteClient } from "@sitenote/db";

export const BOX_COLOR: readonly [number, number, number] = [74, 111, 165];
export const PAGE_COLOR: readonly [number, number, number] = [255, 255, 255];
export const BOX_WIDTH = 300;
export const BOX_HEIGHT = 120;
export const PADDING = 16;
export const EDGE_INSET = 4;

export interface StoredThread {
  id: string;
  workspaceId: string;
  screenshotPath: string | null;
  rawContext: unknown;
  context: ThreadContext | null;
}

export interface DecodedImage {
  width: number;
  height: number;
  center: number[];
  topLeft: number[];
  bottomRight: number[];
}

export async function storedThreads(
  client: SitenoteClient,
  pageUrl: string,
): Promise<StoredThread[]> {
  const { data, error } = await client
    .from("threads")
    .select("id, workspace_id, screenshot_path, context")
    .eq("page_url", pageUrl)
    .order("created_at", { ascending: true });
  if (error !== null) {
    throw new Error(`Reading the threads of ${pageUrl} failed: ${error.message}`);
  }
  return data.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    screenshotPath: row.screenshot_path,
    rawContext: row.context,
    context: parseThreadContext(row.context),
  }));
}

export async function onlyThread(client: SitenoteClient, pageUrl: string): Promise<StoredThread> {
  const threads = await storedThreads(client, pageUrl);
  const [thread] = threads;
  if (thread === undefined || threads.length !== 1) {
    throw new Error(`Expected one thread on ${pageUrl} but found ${String(threads.length)}`);
  }
  return thread;
}

export async function downloadScreenshot(client: SitenoteClient, path: string): Promise<number[]> {
  const { data, error } = await client.storage.from("screenshots").download(path);
  if (error !== null) {
    throw new Error(`Downloading ${path} failed: ${error.message}`);
  }
  return Array.from(new Uint8Array(await data.arrayBuffer()));
}

export async function decodeImage(page: Page, bytes: number[]): Promise<DecodedImage> {
  return page.evaluate(
    async ({ input, inset }) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(input)]));
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (context === null) {
        throw new Error("A 2d canvas is not available");
      }
      context.drawImage(bitmap, 0, 0);
      const pixel = (x: number, y: number): number[] =>
        Array.from(context.getImageData(x, y, 1, 1).data);
      return {
        width: bitmap.width,
        height: bitmap.height,
        center: pixel(Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2)),
        topLeft: pixel(inset, inset),
        bottomRight: pixel(bitmap.width - 1 - inset, bitmap.height - 1 - inset),
      };
    },
    { input: bytes, inset: EDGE_INSET },
  );
}

export function isColor(
  pixel: readonly number[],
  expected: readonly [number, number, number],
  tolerance = 12,
): boolean {
  return expected.every(
    (channel, index) => Math.abs((pixel[index] ?? -999) - channel) <= tolerance,
  );
}

export async function removeScreenshots(client: SitenoteClient, paths: string[]): Promise<void> {
  if (paths.length > 0) {
    await client.storage.from("screenshots").remove(paths);
  }
}
