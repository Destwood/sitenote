export function corsHeaders(siteUrl: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": new URL(siteUrl).origin,
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, x-webhook-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
