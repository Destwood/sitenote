import type { SitenoteClient } from "@sitenote/db";
import type { NextRequest } from "next/server";

import type { CallbackErrorKey } from "../../../auth-error";
import { redirectResponse } from "../../../redirect-response";
import { safeRedirectPath } from "../../../safe-redirect";
import { createSupabaseServerClient } from "../../../supabase-server";

const EMAIL_OTP_TYPES = ["email", "magiclink"] as const;

type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number];

function parseEmailOtpType(value: string | null): EmailOtpType | null {
  return EMAIL_OTP_TYPES.find((type) => type === value) ?? null;
}

function signInError(request: NextRequest, key: CallbackErrorKey) {
  return redirectResponse(request, `/sign-in?error=${key}`);
}

async function completeSignIn(
  supabase: SitenoteClient,
  searchParams: URLSearchParams,
): Promise<CallbackErrorKey | null> {
  const tokenHash = searchParams.get("token_hash");
  if (tokenHash !== null && tokenHash !== "") {
    const type = parseEmailOtpType(searchParams.get("type"));
    if (type === null) {
      return "exchange_failed";
    }
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    return error === null ? null : "exchange_failed";
  }
  const code = searchParams.get("code");
  if (code === null || code === "") {
    return "missing_code";
  }
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return error === null ? null : "exchange_failed";
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  if (searchParams.has("error")) {
    return signInError(request, "access_denied");
  }

  const supabase = await createSupabaseServerClient();
  const failure = await completeSignIn(supabase, searchParams);
  if (failure !== null) {
    return signInError(request, failure);
  }
  return redirectResponse(request, safeRedirectPath(searchParams.get("next")));
}
