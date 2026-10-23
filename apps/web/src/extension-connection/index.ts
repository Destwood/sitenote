import { sendSessionToExtension } from "../extension-bridge";
import { getSupabaseBrowserClient } from "../supabase-browser";
import { forgetWebSession } from "../web-session";

const ALREADY_SIGNED_IN_CODE = "already_signed_in";

export type ExtensionConnection =
  | { status: "connected"; webCopyCleared: boolean }
  | { status: "missing" }
  | { status: "alreadySignedIn" }
  | { status: "failed" };

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
    if (result.status === "unavailable") {
      return { status: "missing" };
    }
    if (result.status === "rejected") {
      return result.code === ALREADY_SIGNED_IN_CODE
        ? { status: "alreadySignedIn" }
        : { status: "failed" };
    }
    return { status: "connected", webCopyCleared: await forgetWebSession() };
  } catch {
    return { status: "failed" };
  }
}
