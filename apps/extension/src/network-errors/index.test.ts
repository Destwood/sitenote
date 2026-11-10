import {
  NETWORK_ERRORS_MAX,
  NETWORK_METHOD_MAX,
  NETWORK_STATUS_TEXT_MAX,
  NETWORK_URL_MAX,
} from "@sitenote/core";
import { describe, expect, it, vi } from "vitest";

import {
  BUFFER_SIZE,
  METHOD_MAX,
  STATUS_TEXT_MAX,
  URL_MAX,
  createNetworkBuffer,
  installNetworkCapture,
  type NetworkCaptureTarget,
} from ".";

const NOW = new Date("2026-10-22T09:30:00.000Z");
const BASE = "https://example.test/app/page";

class FakeXhr extends EventTarget {
  status = 0;
  statusText = "";
  open(method: string, url: string): string {
    return `${method} ${url}`;
  }
  send(): number {
    return this.status;
  }
}

function setup(
  fetchImpl: typeof fetch = () => Promise.resolve(new Response(null, { status: 200 })),
) {
  class Xhr extends FakeXhr {}
  const fetchMock = vi.fn(fetchImpl);
  const win = {
    location: { href: BASE },
    fetch: fetchMock,
    XMLHttpRequest: Xhr,
  } as unknown as NetworkCaptureTarget;
  const buffer = createNetworkBuffer(() => NOW);
  installNetworkCapture(win, buffer);
  return { win, buffer, fetchMock, Xhr };
}

describe("limits", () => {
  it("match the schema limits of the core package", () => {
    expect(BUFFER_SIZE).toBe(NETWORK_ERRORS_MAX);
    expect(URL_MAX).toBe(NETWORK_URL_MAX);
    expect(METHOD_MAX).toBe(NETWORK_METHOD_MAX);
    expect(STATUS_TEXT_MAX).toBe(NETWORK_STATUS_TEXT_MAX);
  });
});

describe("createNetworkBuffer", () => {
  it("keeps the newest twenty records in order", () => {
    const buffer = createNetworkBuffer(() => NOW);

    for (let index = 0; index < 25; index += 1) {
      buffer.push({ kind: "fetch", method: "GET", url: String(index), status: 500 });
    }

    const records = buffer.snapshot();
    expect(records).toHaveLength(20);
    expect(records[0]?.url).toBe("5");
    expect(records.at(-1)?.url).toBe("24");
  });

  it("truncates the text fields and drops the empty status text", () => {
    const buffer = createNetworkBuffer(() => NOW);

    buffer.push({
      kind: "xhr",
      method: "m".repeat(METHOD_MAX + 1),
      url: "u".repeat(URL_MAX + 1),
      status: 503,
      statusText: "",
    });
    buffer.push({ kind: "xhr", method: "GET", url: "/", status: 0, statusText: "s".repeat(61) });

    const [first, second] = buffer.snapshot();
    expect(first).toEqual({
      kind: "xhr",
      method: "m".repeat(METHOD_MAX),
      url: "u".repeat(URL_MAX),
      status: 503,
      at: NOW.toISOString(),
    });
    expect(second?.statusText).toHaveLength(STATUS_TEXT_MAX);
  });

  it("returns copies that cannot change the buffer", () => {
    const buffer = createNetworkBuffer(() => NOW);
    buffer.push({ kind: "fetch", method: "GET", url: "https://example.test/", status: 500 });

    const [record] = buffer.snapshot();
    if (record !== undefined) {
      record.url = "changed";
    }

    expect(buffer.snapshot()[0]?.url).toBe("https://example.test/");
  });
});

describe("installNetworkCapture for fetch", () => {
  it("records a failed response without the query or hash and returns the response untouched", async () => {
    const response = new Response("nope", { status: 500, statusText: "Server Error" });
    const { win, buffer } = setup(() => Promise.resolve(response));

    const result = await win.fetch("/api/orders?id=7#top", { method: "post" });

    expect(result).toBe(response);
    expect(buffer.snapshot()).toMatchObject([
      {
        kind: "fetch",
        method: "POST",
        url: "https://example.test/api/orders",
        status: 500,
        statusText: "Server Error",
        at: NOW.toISOString(),
      },
    ]);
    expect(buffer.snapshot()[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("records a network failure with status 0 and rethrows the original error", async () => {
    const failure = new TypeError("Failed to fetch");
    const { win, buffer } = setup(() => Promise.reject(failure));

    await expect(win.fetch("https://example.test/feed")).rejects.toBe(failure);

    expect(buffer.snapshot()).toMatchObject([
      { kind: "fetch", method: "GET", url: "https://example.test/feed", status: 0 },
    ]);
  });

  it("ignores aborts, successful responses and non-http urls", async () => {
    const abort = new DOMException("aborted", "AbortError");
    const aborted = setup(() => Promise.reject(abort));
    await expect(aborted.win.fetch("https://example.test/slow")).rejects.toBe(abort);
    expect(aborted.buffer.snapshot()).toEqual([]);

    const ok = setup();
    await ok.win.fetch("https://example.test/ok");
    expect(ok.buffer.snapshot()).toEqual([]);

    const other = setup(() => Promise.resolve(new Response(null, { status: 500 })));
    await other.win.fetch("data:text/plain,hello");
    await other.win.fetch("blob:https://example.test/id");
    expect(other.buffer.snapshot()).toEqual([]);
  });

  it("resolves relative urls against the page and reads the method of a Request", async () => {
    const { win, buffer } = setup(() => Promise.resolve(new Response(null, { status: 404 })));

    await win.fetch("/missing/item?x=1");
    await win.fetch(new Request("https://example.test/gone", { method: "delete" }));

    expect(buffer.snapshot()).toMatchObject([
      { method: "GET", url: "https://example.test/missing/item", status: 404 },
      { method: "DELETE", url: "https://example.test/gone", status: 404 },
    ]);
  });

  it("does not wrap twice when installed again", () => {
    const { win, buffer } = setup();
    const wrapper = win.fetch;

    installNetworkCapture(win, buffer);

    expect(win.fetch).toBe(wrapper);
  });
});

describe("installNetworkCapture for XMLHttpRequest", () => {
  it("records a failed status with its status text once the request ends", () => {
    const { Xhr, buffer } = setup();
    const xhr = new Xhr();

    xhr.open("get", "/api/x?y=1");
    xhr.send();
    xhr.status = 503;
    xhr.statusText = "Unavailable";
    xhr.dispatchEvent(new Event("loadend"));

    expect(buffer.snapshot()).toMatchObject([
      {
        kind: "xhr",
        method: "GET",
        url: "https://example.test/api/x",
        status: 503,
        statusText: "Unavailable",
        at: NOW.toISOString(),
      },
    ]);
    expect(buffer.snapshot()[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("records a network error or timeout as status 0", () => {
    const { Xhr, buffer } = setup();

    const failed = new Xhr();
    failed.open("POST", "https://example.test/upload");
    failed.send();
    failed.dispatchEvent(new Event("error"));
    failed.dispatchEvent(new Event("loadend"));

    const timedOut = new Xhr();
    timedOut.open("PUT", "https://example.test/slow");
    timedOut.send();
    timedOut.dispatchEvent(new Event("timeout"));
    timedOut.dispatchEvent(new Event("loadend"));

    expect(buffer.snapshot()).toMatchObject([
      { kind: "xhr", method: "POST", url: "https://example.test/upload", status: 0 },
      { kind: "xhr", method: "PUT", url: "https://example.test/slow", status: 0 },
    ]);
  });

  it("ignores aborts and successful requests", () => {
    const { Xhr, buffer } = setup();

    const aborted = new Xhr();
    aborted.open("GET", "/a");
    aborted.send();
    aborted.dispatchEvent(new Event("abort"));
    aborted.dispatchEvent(new Event("loadend"));

    const ok = new Xhr();
    ok.open("GET", "/b");
    ok.send();
    ok.status = 200;
    ok.dispatchEvent(new Event("loadend"));

    expect(buffer.snapshot()).toEqual([]);
  });
});
