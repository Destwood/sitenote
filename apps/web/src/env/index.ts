import * as z from "zod/mini";

const nonEmptyString = z.string().check(z.minLength(1));

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: nonEmptyString,
  NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: z.optional(z.enum(["true", "false"])),
});

export interface PublicEnv {
  supabaseUrl: string;
  supabasePublishableKey: string;
  googleAuthEnabled: boolean;
}

export type EnvSource = Readonly<Record<string, string | undefined>>;

export function parsePublicEnv(source: EnvSource): PublicEnv {
  const normalized = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );
  const result = publicEnvSchema.safeParse(normalized);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(
      `Invalid or missing environment variables: ${names.join(", ")}. Run "pnpm db:env" or copy .env.example.`,
    );
  }
  return {
    supabaseUrl: result.data.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: result.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    googleAuthEnabled: result.data.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true",
  };
}

let cached: PublicEnv | undefined;

export function getPublicEnv(): PublicEnv {
  cached ??= parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED,
  });
  return cached;
}
