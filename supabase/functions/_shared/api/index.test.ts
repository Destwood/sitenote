import { describe, expect, it } from "vitest";

import { ApiError, errorResponse, jsonResponse } from ".";

describe("errorResponse", () => {
  it.each([
    ["unauthorized", 401],
    ["forbidden", 403],
    ["not_found", 404],
    ["validation", 400],
    ["not_configured", 409],
    ["upstream", 502],
  ] as const)("maps %s to HTTP %i with the code in the body", async (code, status) => {
    const response = errorResponse(new ApiError(code, "Readable message"));
    expect(response.status).toBe(status);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(await response.json()).toEqual({ error: { code, message: "Readable message" } });
  });

  it("hides the message of unexpected errors", async () => {
    const response = errorResponse(new Error("connection string leaked"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "unknown", message: "Unexpected error" },
    });
  });

  it("applies the given headers", () => {
    const response = errorResponse(new ApiError("forbidden", "No"), { "X-Test": "1" });
    expect(response.headers.get("X-Test")).toBe("1");
  });
});

describe("jsonResponse", () => {
  it("serialises the body with the JSON content type", async () => {
    const response = jsonResponse({ ok: true }, 201, {
      "Access-Control-Allow-Origin": "https://a.test",
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://a.test");
    expect(await response.json()).toEqual({ ok: true });
  });
});
