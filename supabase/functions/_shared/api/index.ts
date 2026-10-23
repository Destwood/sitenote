export type ResponseHeaders = ConstructorParameters<typeof Headers>[0];

export const API_ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "validation",
  "not_configured",
  "upstream",
  "unknown",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation: 400,
  not_configured: 409,
  upstream: 502,
  unknown: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

export function jsonResponse(
  body: unknown,
  status: number,
  headers: ResponseHeaders = {},
): Response {
  const merged = new Headers(headers);
  merged.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers: merged });
}

export function errorResponse(error: unknown, headers: ResponseHeaders = {}): Response {
  const failure =
    error instanceof ApiError
      ? { code: error.code, message: error.message }
      : { code: "unknown" as const, message: "Unexpected error" };
  return jsonResponse({ error: failure }, STATUS[failure.code], headers);
}
