import { describe, expect, it } from "vitest";

import { ApiError } from "../api/index.ts";

import { describeError, endpoint, requireEnv } from "./index.ts";

const env = { SITE_URL: "https://app.sitenote.test" };

function post(): Request {
  return new Request("https://functions.test/clickup-create-task", { method: "POST" });
}

describe("requireEnv", () => {
  it("returns a configured value", () => {
    expect(requireEnv({ RESEND_API_KEY: "re_1" }, "RESEND_API_KEY")).toBe("re_1");
  });

  it("reports a missing or empty value as not configured, naming only the variable", () => {
    expect(() => requireEnv({ EMPTY: "" }, "EMPTY")).toThrow(ApiError);
    expect(() => requireEnv({}, "MISSING")).toThrow("MISSING is not set");
  });
});

describe("describeError", () => {
  it("keeps the name and message of an error and nothing else", () => {
    expect(describeError(new TypeError("bad"))).toBe("TypeError: bad");
    expect(describeError("text")).toBe("non-error exception");
  });
});

describe("endpoint", () => {
  it("answers a preflight with the CORS headers of the site", async () => {
    const response = await endpoint(
      new Request("https://functions.test/x", { method: "OPTIONS" }),
      env,
      () => Promise.reject(new Error("must not run")),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://app.sitenote.test");
  });

  it("passes the CORS headers to the handler and returns its response", async () => {
    const response = await endpoint(post(), env, (cors) => {
      expect(cors["Access-Control-Allow-Origin"]).toBe("https://app.sitenote.test");
      return Promise.resolve(new Response("ok", { status: 201 }));
    });
    expect(response.status).toBe(201);
  });

  it("maps an ApiError thrown by the handler to its code", async () => {
    const response = await endpoint(post(), env, () =>
      Promise.reject(new ApiError("forbidden", "Only the owner can do that")),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: "forbidden", message: "Only the owner can do that" },
    });
  });

  it("rejects other methods with a validation error", async () => {
    const response = await endpoint(new Request("https://functions.test/x"), env, () =>
      Promise.resolve(new Response("never")),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "validation", message: "Use the POST method" },
    });
  });

  it("refuses to run without a site url", async () => {
    const response = await endpoint(post(), {}, () => Promise.resolve(new Response("never")));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "not_configured", message: "SITE_URL is not set" },
    });
  });
});
