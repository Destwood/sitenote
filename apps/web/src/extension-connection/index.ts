import * as z from "zod/mini";

import { type ExtensionResult, sendSessionToExtension } from "../extension-bridge";
import { getSupabaseBrowserClient } from "../supabase-browser";
import { forgetWebSession } from "../web-session";

const ALREADY_SIGNED_IN_CODE = "already_signed_in";
const SESSION_PATH = "/extension/connect/session";

const nonEmptyString = z.string().check(z.minLength(1));
const mintedSessionSchema = z.object({
  accessToken: nonEmptyString,
  refreshToken: nonEmptyString,
});

export type ExtensionConnection =
  | { status: "connected"; webCopyCleared: boolean }
  | { status: "missing" }
  | { status: "alreadySignedIn" }
  | { status: "failed" };

function failureOf(result: ExtensionResult): ExtensionConnection | null {
  if (result.status === "unavailable") {
    return { status: "missing" };
  }
  if (result.status === "rejected") {
    return result.code === ALREADY_SIGNED_IN_CODE
      ? { status: "alreadySignedIn" }
      : { status: "failed" };
  }
  return null;
}

export async function connectExtension(extensionId: string): Promise<ExtensionConnection> {
  try {
    const { data } = await getSupabaseBrowserClient().auth.getSession();
    if (data.session === null) {
      return { status: "failed" };
    }
    const result = await sendSessionToExtension(extensionId, {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    });
    const failure = failureOf(result);
    if (failure !== null) {
      return failure;
    }
    return { status: "connected", webCopyCleared: await forgetWebSession() };
  } catch {
    return { status: "failed" };
  }
}

export async function connectMemberExtension(
  extensionId: string,
  fetcher: typeof fetch = fetch,
): Promise<ExtensionConnection> {
  try {
    const response = await fetcher(SESSION_PATH, { method: "POST", credentials: "same-origin" });
    if (!response.ok) {
      return { status: "failed" };
    }
    const minted = mintedSessionSchema.safeParse(await response.json());
    if (!minted.success) {
      return { status: "failed" };
    }
    const result = await sendSessionToExtension(extensionId, {
      accessToken: minted.data.accessToken,
      refreshToken: minted.data.refreshToken,
    });
    return failureOf(result) ?? { status: "connected", webCopyCleared: true };
  } catch {
    return { status: "failed" };
  }
}
