import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "../../../env";

const AUTH_COOKIE_PREFIX = "sb-";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== getPublicEnv().webUrl) {
    return new NextResponse(null, { status: 403 });
  }
  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll()) {
    if (name.startsWith(AUTH_COOKIE_PREFIX)) {
      cookieStore.delete(name);
    }
  }
  return new NextResponse(null, { status: 204 });
}
