import type { NextRequest } from "next/server";

import type { CallbackErrorKey } from "../../../auth-error";
import { redirectResponse } from "../../../redirect-response";
import { safeRedirectPath } from "../../../safe-redirect";
import { createSupabaseServerClient } from "../../../supabase-server";

function signInError(request: NextRequest, key: CallbackErrorKey) {
  return redirectResponse(request, `/sign-in?error=${key}`);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  if (searchParams.has("error")) {
    return signInError(request, "access_denied");
  }
  const code = searchParams.get("code");
  if (code === null || code === "") {
    return signInError(request, "missing_code");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error !== null) {
    return signInError(request, "exchange_failed");
  }
  return redirectResponse(request, safeRedirectPath(searchParams.get("next")));
}
