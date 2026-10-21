import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { EXTENSION_PUBLIC_KEY } from ".";

const EXPECTED_EXTENSION_ID = "anefihllkbkenhjbjggfndgemgkfaeoa";
const SPKI_PREFIX_RSA_2048 = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA";

function computeExtensionId(publicKeyBase64: string): string {
  const digest = createHash("sha256")
    .update(Buffer.from(publicKeyBase64, "base64"))
    .digest("hex")
    .slice(0, 32);
  return Array.from(digest, (char) => String.fromCharCode(97 + Number.parseInt(char, 16))).join("");
}

describe("extension key", () => {
  it("is a base64 RSA 2048 SubjectPublicKeyInfo", () => {
    expect(EXTENSION_PUBLIC_KEY.startsWith(SPKI_PREFIX_RSA_2048)).toBe(true);
    expect(Buffer.from(EXTENSION_PUBLIC_KEY, "base64").toString("base64")).toBe(
      EXTENSION_PUBLIC_KEY,
    );
  });

  it("produces the pinned extension id", () => {
    expect(computeExtensionId(EXTENSION_PUBLIC_KEY)).toBe(EXPECTED_EXTENSION_ID);
  });

  it("maps hex digits to the letters a to p", () => {
    expect(computeExtensionId(EXTENSION_PUBLIC_KEY)).toMatch(/^[a-p]{32}$/);
  });
});
