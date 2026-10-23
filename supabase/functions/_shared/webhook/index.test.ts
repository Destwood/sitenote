import { describe, expect, it } from "vitest";

import { isValidWebhookSecret } from "./index.ts";

describe("isValidWebhookSecret", () => {
  it("accepts only the exact configured secret", () => {
    expect(isValidWebhookSecret("s3cret-value", "s3cret-value")).toBe(true);
    expect(isValidWebhookSecret("s3cret-valuE", "s3cret-value")).toBe(false);
    expect(isValidWebhookSecret("s3cret", "s3cret-value")).toBe(false);
  });

  it("rejects a missing header and an unconfigured secret", () => {
    expect(isValidWebhookSecret(null, "s3cret-value")).toBe(false);
    expect(isValidWebhookSecret("", "")).toBe(false);
  });
});
