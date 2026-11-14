import { describe, expect, it } from "vitest";

import { pagePathDisplay, pagePathLabel } from ".";

describe("pagePathLabel", () => {
  it("shows the path and the query without the origin", () => {
    expect(pagePathLabel("https://example.test/pricing/team?plan=pro")).toBe(
      "/pricing/team?plan=pro",
    );
  });

  it("shows the root path for a bare origin", () => {
    expect(pagePathLabel("https://example.test")).toBe("/");
  });

  it("returns the input unchanged when it is not a URL", () => {
    expect(pagePathLabel("not a url")).toBe("not a url");
  });
});

describe("pagePathDisplay", () => {
  const SITE_ID = "30000000-0000-4000-8000-000000000001";
  const PAGE_ID = "9F1C2B3A-4D5E-4F60-8A7B-1C2D3E4F5A6B";

  it("replaces UUID path segments with {id}, whatever their case", () => {
    expect(pagePathDisplay(`https://example.test/sites/${SITE_ID}/pages/${PAGE_ID}`)).toBe(
      "/sites/{id}/pages/{id}",
    );
  });

  it("keeps the query string untouched, even when it holds a UUID", () => {
    expect(pagePathDisplay(`https://example.test/pricing?ref=${SITE_ID}&plan=pro`)).toBe(
      `/pricing?ref=${SITE_ID}&plan=pro`,
    );
  });

  it("keeps segments that only look like UUIDs when they are not canonical", () => {
    expect(pagePathDisplay("https://example.test/a/30000000-0000-4000-8000-00000000001")).toBe(
      "/a/30000000-0000-4000-8000-00000000001",
    );
    expect(pagePathDisplay("https://example.test/a/30000000-0000-0000-8000-000000000001")).toBe(
      "/a/30000000-0000-0000-8000-000000000001",
    );
  });

  it("matches pagePathLabel when no segment is a UUID", () => {
    expect(pagePathDisplay("https://example.test/pricing/team?plan=pro")).toBe(
      pagePathLabel("https://example.test/pricing/team?plan=pro"),
    );
  });

  it("returns the input unchanged when it is not a URL", () => {
    expect(pagePathDisplay("not a url")).toBe("not a url");
  });
});
