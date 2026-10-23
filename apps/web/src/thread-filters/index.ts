import { parsePageNumber } from "../pagination";
import { parseUuid } from "../uuid";
import { workspacePath } from "../workspace-paths";

export const THREAD_STATUS_FILTERS = ["open", "resolved", "all"] as const;

export type ThreadStatusFilter = (typeof THREAD_STATUS_FILTERS)[number];

export type ThreadSearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

export const FILTER_TEXT_MAX_LENGTH = 200;

export interface ThreadFilters {
  site: string | null;
  page: string;
  status: ThreadStatusFilter;
  author: string | null;
  query: string;
}

export interface ThreadQuery {
  filters: ThreadFilters;
  pageNumber: number;
}

function firstValue(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}

function parseText(value: string | undefined): string {
  return (value ?? "").trim().slice(0, FILTER_TEXT_MAX_LENGTH);
}

export function parseThreadQuery(params: ThreadSearchParams): ThreadQuery {
  const status = firstValue(params.status);
  return {
    filters: {
      site: parseUuid(firstValue(params.site)),
      page: parseText(firstValue(params.page)),
      status: THREAD_STATUS_FILTERS.find((candidate) => candidate === status) ?? "open",
      author: parseUuid(firstValue(params.author)),
      query: parseText(firstValue(params.q)),
    },
    pageNumber: parsePageNumber(firstValue(params.pg)),
  };
}

export function hasActiveFilters(filters: ThreadFilters): boolean {
  return (
    filters.site !== null ||
    filters.page !== "" ||
    filters.status !== "open" ||
    filters.author !== null ||
    filters.query !== ""
  );
}

export function threadsHref(
  workspaceId: string,
  filters: ThreadFilters,
  pageNumber: number,
): string {
  const params = new URLSearchParams();
  if (filters.site !== null) {
    params.set("site", filters.site);
  }
  if (filters.page !== "") {
    params.set("page", filters.page);
  }
  if (filters.status !== "open") {
    params.set("status", filters.status);
  }
  if (filters.author !== null) {
    params.set("author", filters.author);
  }
  if (filters.query !== "") {
    params.set("q", filters.query);
  }
  if (pageNumber > 1) {
    params.set("pg", String(pageNumber));
  }
  const base = workspacePath(workspaceId, "threads");
  const query = params.toString();
  return query === "" ? base : `${base}?${query}`;
}
