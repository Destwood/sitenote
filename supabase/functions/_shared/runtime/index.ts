import { ApiError, errorResponse } from "../api/index.ts";
import { corsHeaders } from "../cors/index.ts";

export type EnvMap = Readonly<Record<string, string | undefined>>;
export type Cors = Record<string, string>;

export function requireEnv(env: EnvMap, name: string): string {
  const value = env[name];
  if (value === undefined || value.length === 0) {
    throw new ApiError("not_configured", `${name} is not set`);
  }
  return value;
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return "non-error exception";
}

export async function endpoint(
  request: Request,
  env: EnvMap,
  run: (cors: Cors) => Promise<Response>,
): Promise<Response> {
  let cors: Cors = {};
  try {
    cors = corsHeaders(requireEnv(env, "SITE_URL"));
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
      throw new ApiError("validation", "Use the POST method");
    }
    return await run(cors);
  } catch (error) {
    if (!(error instanceof ApiError)) {
      console.error(describeError(error));
    }
    return errorResponse(error, cors);
  }
}
