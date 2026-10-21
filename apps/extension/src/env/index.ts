import * as z from "zod/mini";

const envSchema = z.object({
  WXT_SUPABASE_URL: z.url(),
  WXT_SUPABASE_PUBLISHABLE_KEY: z.string().check(z.minLength(1)),
  WXT_WEB_URL: z.url(),
  WXT_AUTH_GOOGLE_ENABLED: z.optional(z.enum(["true", "false"])),
});

export interface ExtensionEnv {
  supabaseUrl: string;
  supabasePublishableKey: string;
  webUrl: string;
  googleAuthEnabled: boolean;
}

export type EnvSource = Readonly<Record<string, string | undefined>>;

export function parseExtensionEnv(source: EnvSource): ExtensionEnv {
  const normalized = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );
  const result = envSchema.safeParse(normalized);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(
      `Invalid or missing environment variables: ${names.join(", ")}. Run "pnpm db:env" before building the extension.`,
    );
  }
  return {
    supabaseUrl: result.data.WXT_SUPABASE_URL,
    supabasePublishableKey: result.data.WXT_SUPABASE_PUBLISHABLE_KEY,
    webUrl: result.data.WXT_WEB_URL,
    googleAuthEnabled: result.data.WXT_AUTH_GOOGLE_ENABLED === "true",
  };
}

export function getExtensionEnv(): ExtensionEnv {
  return parseExtensionEnv({
    WXT_SUPABASE_URL: import.meta.env.WXT_SUPABASE_URL,
    WXT_SUPABASE_PUBLISHABLE_KEY: import.meta.env.WXT_SUPABASE_PUBLISHABLE_KEY,
    WXT_WEB_URL: import.meta.env.WXT_WEB_URL,
    WXT_AUTH_GOOGLE_ENABLED: import.meta.env.WXT_AUTH_GOOGLE_ENABLED,
  });
}
