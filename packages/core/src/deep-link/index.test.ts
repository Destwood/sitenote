import { describe, expect, it } from "vitest";

import { appendThreadHash, buildThreadHash, parseThreadHash } from ".";

const THREAD_ID = "30000000-0000-4000-8000-0000000000ab";

describe("buildThreadHash", () => {
  it("names the thread in the sitenote hash parameter", () => {
    expect(buildThreadHash(THREAD_ID)).toBe(`#sitenote=${THREAD_ID}`);
  });
});

describe("appendThreadHash", () => {
  it("adds the hash to a page without one", () => {
    expect(appendThreadHash("https://example.com/pricing", THREAD_ID)).toBe(
      `https://example.com/pricing#sitenote=${THREAD_ID}`,
    );
  });

  it("keeps the path and the query and replaces an existing hash", () => {
    expect(appendThreadHash("http://localhost:3000/docs/a?x=1#top", THREAD_ID)).toBe(
      `http://localhost:3000/docs/a?x=1#sitenote=${THREAD_ID}`,
    );
  });

  it("keeps the origin root without a trailing path", () => {
    expect(appendThreadHash("http://127.0.0.1:4173", THREAD_ID)).toBe(
      `http://127.0.0.1:4173/#sitenote=${THREAD_ID}`,
    );
  });

  it("returns null for an address that is not a URL", () => {
    expect(appendThreadHash("not a url", THREAD_ID)).toBeNull();
  });
});

describe("parseThreadHash", () => {
  it("reads the thread id from the hash", () => {
    expect(parseThreadHash(`#sitenote=${THREAD_ID}`)).toBe(THREAD_ID);
  });

  it("reads the thread id among other hash parameters", () => {
    expect(parseThreadHash(`#intro&sitenote=${THREAD_ID}&x=1`)).toBe(THREAD_ID);
  });

  it("accepts a hash without the leading hash sign", () => {
    expect(parseThreadHash(`sitenote=${THREAD_ID}`)).toBe(THREAD_ID);
  });

  it("returns the id in lower case", () => {
    expect(parseThreadHash(`#sitenote=${THREAD_ID.toUpperCase()}`)).toBe(THREAD_ID);
  });

  it.each([
    ["an empty hash", ""],
    ["a bare hash sign", "#"],
    ["another anchor", "#pricing"],
    ["another key", `#note=${THREAD_ID}`],
    ["an empty value", "#sitenote="],
    ["a value that is not a uuid", "#sitenote=abc"],
    ["a uuid with a wrong group", "#sitenote=30000000-0000-4000-8000-0000000000a"],
    ["a uuid with extra characters", `#sitenote=${THREAD_ID}x`],
    ["a uuid with surrounding spaces", `#sitenote=%20${THREAD_ID}`],
    ["a script attempt", "#sitenote=<script>alert(1)</script>"],
  ])("returns null for %s", (_label, hash) => {
    expect(parseThreadHash(hash)).toBeNull();
  });
});
