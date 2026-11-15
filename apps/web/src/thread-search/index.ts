import type { Enums, SitenoteClient } from "@sitenote/db";

import { PAGE_SIZE, pageOffset } from "../pagination";
import type { ThreadFilters } from "../thread-filters";

export interface ThreadRow {
  id: string;
  pageUrl: string;
  status: Enums<"thread_status">;
  createdBy: string;
  createdAt: string;
  commentCount: number;
  lastActivity: string;
  firstBody: string;
  hasRecording: boolean;
}

export interface ThreadSearch {
  rows: ThreadRow[];
  total: number;
}

function searchArguments(workspaceId: string, filters: ThreadFilters, pageNumber: number) {
  return {
    p_workspace_id: workspaceId,
    p_limit: PAGE_SIZE,
    p_offset: pageOffset(pageNumber),
    ...(filters.query === "" ? {} : { p_q: filters.query }),
    ...(filters.page === "" ? {} : { p_page: filters.page }),
    ...(filters.site === null ? {} : { p_site_id: filters.site }),
    ...(filters.author === null ? {} : { p_author_id: filters.author }),
    ...(filters.status === "all" ? {} : { p_status: filters.status }),
  };
}

function isRecording(value: unknown): boolean {
  return (
    typeof value === "object" && value !== null && "path" in value && typeof value.path === "string"
  );
}

async function readRecordingIds(supabase: SitenoteClient, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) {
    return new Set();
  }
  const { data, error } = await supabase
    .from("threads")
    .select("id, recording:context->recording")
    .in("id", ids);
  if (error !== null) {
    throw new Error("Could not read the thread types.");
  }
  return new Set(data.filter((row) => isRecording(row.recording)).map((row) => row.id));
}

export async function searchThreads(
  supabase: SitenoteClient,
  workspaceId: string,
  filters: ThreadFilters,
  pageNumber: number,
): Promise<ThreadSearch> {
  const { data, error } = await supabase.rpc(
    "search_threads",
    searchArguments(workspaceId, filters, pageNumber),
  );
  if (error !== null) {
    throw new Error("Could not search the threads.");
  }
  const recordingIds = await readRecordingIds(
    supabase,
    data.map((row) => row.thread_id),
  );
  return {
    rows: data.map((row) => ({
      id: row.thread_id,
      pageUrl: row.page_url,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
      commentCount: row.comment_count,
      lastActivity: row.last_activity,
      firstBody: row.first_body,
      hasRecording: recordingIds.has(row.thread_id),
    })),
    total: data[0]?.total_count ?? 0,
  };
}
