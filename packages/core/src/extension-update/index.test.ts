import { describe, expect, it, vi } from "vitest";

import {
  EXTENSION_RELEASE_API_URL,
  fetchLatestExtensionVersion,
  isNewerVersion,
  parseExtensionVersion,
} from ".";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("parseExtensionVersion", () => {
  it.each([
    ["Sitenote extension v0.1.12", "0.1.12"],
    ["0.1.3", "0.1.3"],
    ["build 1.2.3 and 4.5.6", "1.2.3"],
    ["version 10.20.30", "10.20.30"],
  ])("finds the first version in %j", (text, expected) => {
    expect(parseExtensionVersion(text)).toBe(expected);
  });

  it.each(["", "latest", "1.2", "v1"])("returns null when %j has no version", (text) => {
    expect(parseExtensionVersion(text)).toBeNull();
  });
});

describe("isNewerVersion", () => {
  it("compares the parts as numbers, not as text", () => {
    expect(isNewerVersion("0.1.9", "0.1.10")).toBe(true);
    expect(isNewerVersion("0.1.10", "0.1.9")).toBe(false);
  });

  it("is false for the same version", () => {
    expect(isNewerVersion("0.1.12", "0.1.12")).toBe(false);
  });

  it("is true when the latest build has a higher major or minor part", () => {
    expect(isNewerVersion("0.1.99", "0.2.0")).toBe(true);
    expect(isNewerVersion("0.9.0", "1.0.0")).toBe(true);
  });

  it("reads versions out of labels", () => {
    expect(isNewerVersion("0.1.2", "Sitenote extension v0.1.3")).toBe(true);
  });

  it("is false when either side is not a version", () => {
    expect(isNewerVersion("garbage", "0.1.3")).toBe(false);
    expect(isNewerVersion("0.1.2", "garbage")).toBe(false);
    expect(isNewerVersion("", "")).toBe(false);
  });
});

describe("fetchLatestExtensionVersion", () => {
  it("returns the version from the release name", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ name: "Sitenote extension v0.1.42" })),
    );

    expect(await fetchLatestExtensionVersion(fetcher)).toBe("0.1.42");
    expect(fetcher).toHaveBeenCalledWith(EXTENSION_RELEASE_API_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
  });

  it("returns null when the release name has no version", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ name: "Sitenote extension (latest)" })),
    );

    expect(await fetchLatestExtensionVersion(fetcher)).toBeNull();
  });

  it("returns null on an HTTP error", async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ name: "Sitenote extension v0.1.42" }, 404)),
    );

    expect(await fetchLatestExtensionVersion(fetcher)).toBeNull();
  });

  it("returns null when the body has an unexpected shape", async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse({ title: 1 })));

    expect(await fetchLatestExtensionVersion(fetcher)).toBeNull();
  });

  it("returns null when the body is not JSON", async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(new Response("<html>")));

    expect(await fetchLatestExtensionVersion(fetcher)).toBeNull();
  });

  it("returns null instead of throwing when the network fails", async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.reject(new TypeError("offline")));

    expect(await fetchLatestExtensionVersion(fetcher)).toBeNull();
  });
});
