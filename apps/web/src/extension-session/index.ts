export interface MintedSession {
  accessToken: string;
  refreshToken: string;
}

interface GenerateLinkResponse {
  data: { properties: { hashed_token?: string } | null } | null;
  error: Error | null;
}

interface VerifyOtpResponse {
  data: { session?: { access_token: string; refresh_token: string } | null } | null;
  error: Error | null;
}

export interface MintDeps {
  admin: {
    auth: {
      admin: {
        generateLink: (credentials: {
          type: "magiclink";
          email: string;
        }) => Promise<GenerateLinkResponse>;
      };
    };
  };
  createVerifier: () => {
    auth: {
      verifyOtp: (params: { token_hash: string; type: "magiclink" }) => Promise<VerifyOtpResponse>;
    };
  };
}

export async function mintExtensionSession(
  email: string,
  deps: MintDeps,
): Promise<MintedSession | null> {
  try {
    const link = await deps.admin.auth.admin.generateLink({ type: "magiclink", email });
    const hashedToken = link.data?.properties?.hashed_token;
    if (link.error !== null || !hashedToken) {
      return null;
    }
    const verified = await deps.createVerifier().auth.verifyOtp({
      token_hash: hashedToken,
      type: "magiclink",
    });
    const session = verified.data?.session;
    if (verified.error !== null || !session) {
      return null;
    }
    return { accessToken: session.access_token, refreshToken: session.refresh_token };
  } catch {
    return null;
  }
}
