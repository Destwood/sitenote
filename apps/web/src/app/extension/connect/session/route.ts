import { createSitenoteClient } from "@sitenote/db";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "../../../../env";
import { mintExtensionSession } from "../../../../extension-session";
import { getServerEnv } from "../../../../server-env";
import { createSupabaseServerClient, getAuthenticatedUser } from "../../../../supabase-server";

const NO_STORE = { "Cache-Control": "no-store" };
const SEPARATE_SESSION_AUTH = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
};

function empty(status: number) {
  return new NextResponse(null, { status, headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const env = getPublicEnv();
  if (request.headers.get("origin") !== env.webUrl) {
    return empty(403);
  }
  const user = await getAuthenticatedUser(await createSupabaseServerClient());
  if (user === null || user.isAnonymous || user.email === null) {
    return empty(401);
  }
  const { secretKey } = getServerEnv();
  const session = await mintExtensionSession(user.email, {
    admin: createSitenoteClient(env.supabaseUrl, secretKey, { auth: SEPARATE_SESSION_AUTH }),
    createVerifier: () =>
      createSitenoteClient(env.supabaseUrl, env.supabasePublishableKey, {
        auth: SEPARATE_SESSION_AUTH,
      }),
  });
  if (session === null) {
    return empty(502);
  }
  return NextResponse.json(
    { accessToken: session.accessToken, refreshToken: session.refreshToken },
    { status: 200, headers: NO_STORE },
  );
}
