import { NextResponse, type NextRequest } from "next/server";

const SEE_OTHER = 303;

export function redirectResponse(request: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url), SEE_OTHER);
}
