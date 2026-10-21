import type { NextRequest } from "next/server";

import { redirectResponse } from "../../../redirect-response";
import { createSupabaseServerClient } from "../../../supabase-server";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "local" });
  return redirectResponse(request, "/");
}
