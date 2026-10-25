import { describe, expect, it, vi } from "vitest";

import { mintExtensionSession, type MintDeps } from ".";

type GenerateLink = MintDeps["admin"]["auth"]["admin"]["generateLink"];
type VerifyOtp = ReturnType<MintDeps["createVerifier"]>["auth"]["verifyOtp"];

const LINK = { data: { properties: { hashed_token: "hash" } }, error: null };
const VERIFIED = {
  data: { session: { access_token: "access", refresh_token: "refresh" } },
  error: null,
};

function deps(
  generateLink: GenerateLink = () => Promise.resolve(LINK),
  verifyOtp: VerifyOtp = () => Promise.resolve(VERIFIED),
): MintDeps {
  return {
    admin: { auth: { admin: { generateLink } } },
    createVerifier: () => ({ auth: { verifyOtp } }),
  };
}

describe("mintExtensionSession", () => {
  it("generates a magic link for the member and verifies its token on a separate client", async () => {
    const generateLink = vi.fn<GenerateLink>(() => Promise.resolve(LINK));
    const verifyOtp = vi.fn<VerifyOtp>(() => Promise.resolve(VERIFIED));

    expect(await mintExtensionSession("ada@example.com", deps(generateLink, verifyOtp))).toEqual({
      accessToken: "access",
      refreshToken: "refresh",
    });
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "ada@example.com" });
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "hash", type: "magiclink" });
  });

  it("returns null when the magic link cannot be generated", async () => {
    const result = await mintExtensionSession(
      "ada@example.com",
      deps(() =>
        Promise.resolve({ data: { properties: null }, error: new Error("User not found") }),
      ),
    );

    expect(result).toBeNull();
  });

  it.each([
    ["a missing hashed token", { data: { properties: {} }, error: null }],
    ["an empty hashed token", { data: { properties: { hashed_token: "" } }, error: null }],
    ["no data", { data: null, error: null }],
  ])("returns null for %s without verifying", async (_label, link) => {
    const verifyOtp = vi.fn<VerifyOtp>(() => Promise.resolve(VERIFIED));

    expect(
      await mintExtensionSession(
        "ada@example.com",
        deps(() => Promise.resolve(link), verifyOtp),
      ),
    ).toBeNull();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("returns null when the token cannot be verified", async () => {
    const result = await mintExtensionSession(
      "ada@example.com",
      deps(undefined, () =>
        Promise.resolve({ data: { session: null }, error: new Error("expired") }),
      ),
    );

    expect(result).toBeNull();
  });

  it("returns null when verification yields no session", async () => {
    const result = await mintExtensionSession(
      "ada@example.com",
      deps(undefined, () => Promise.resolve({ data: { session: null }, error: null })),
    );

    expect(result).toBeNull();
  });

  it("returns null when a client throws", async () => {
    const result = await mintExtensionSession(
      "ada@example.com",
      deps(() => Promise.reject(new Error("offline"))),
    );

    expect(result).toBeNull();
  });
});
