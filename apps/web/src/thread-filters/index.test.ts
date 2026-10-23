import { describe, expect, it } from "vitest";

import {
  FILTER_TEXT_MAX_LENGTH,
  hasActiveFilters,
  parseThreadQuery,
  threadsHref,
  type ThreadFilters,
} from ".";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const SITE_ID = "30000000-0000-4000-8000-000000000001";
const AUTHOR_ID = "40000000-0000-4000-8000-000000000001";

const DEFAULT_FILTERS: ThreadFilters = {
  site: null,
  page: "",
  status: "open",
  author: null,
  query: "",
};

describe("parseThreadQuery", () => {
  it("defaults to open threads on the first page", () => {
    expect(parseThreadQuery({})).toEqual({ filters: DEFAULT_FILTERS, pageNumber: 1 });
  });

  it("reads every filter and the page", () => {
    expect(
      parseThreadQuery({
        site: SITE_ID,
        page: "  /pricing ",
        status: "all",
        author: AUTHOR_ID,
        q: "contrast",
        pg: "3",
      }),
    ).toEqual({
      filters: {
        site: SITE_ID,
        page: "/pricing",
        status: "all",
        author: AUTHOR_ID,
        query: "contrast",
      },
      pageNumber: 3,
    });
  });

  it("drops values that are not valid ids or statuses", () => {
    const parsed = parseThreadQuery({ site: "nope", author: "nope", status: "closed" });

    expect(parsed.filters).toEqual(DEFAULT_FILTERS);
  });

  it("takes the first value of a repeated parameter", () => {
    expect(parseThreadQuery({ q: ["first", "second"] }).filters.query).toBe("first");
    expect(parseThreadQuery({ q: [] }).filters.query).toBe("");
  });

  it("cuts long text to the maximum length", () => {
    const parsed = parseThreadQuery({ q: "x".repeat(FILTER_TEXT_MAX_LENGTH + 50) });

    expect(parsed.filters.query).toHaveLength(FILTER_TEXT_MAX_LENGTH);
  });
});

describe("hasActiveFilters", () => {
  it("is false for the defaults and true when any filter differs", () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, status: "resolved" })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, query: "a" })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, site: SITE_ID })).toBe(true);
  });
});

describe("threadsHref", () => {
  it("leaves the defaults out of the address", () => {
    expect(threadsHref(WORKSPACE_ID, DEFAULT_FILTERS, 1)).toBe(`/app/w/${WORKSPACE_ID}/threads`);
  });

  it("keeps the filters and the page number in the query", () => {
    const href = threadsHref(
      WORKSPACE_ID,
      { site: SITE_ID, page: "/a b", status: "all", author: AUTHOR_ID, query: "x&y" },
      2,
    );

    expect(href).toBe(
      `/app/w/${WORKSPACE_ID}/threads?site=${SITE_ID}&page=%2Fa+b&status=all&author=${AUTHOR_ID}&q=x%26y&pg=2`,
    );
  });

  it("round-trips through the parser", () => {
    const filters: ThreadFilters = {
      site: SITE_ID,
      page: "/pricing",
      status: "resolved",
      author: AUTHOR_ID,
      query: "contrast",
    };
    const href = threadsHref(WORKSPACE_ID, filters, 4);
    const search = new URL(href, "http://localhost").searchParams;

    expect(parseThreadQuery(Object.fromEntries(search))).toEqual({ filters, pageNumber: 4 });
  });
});
