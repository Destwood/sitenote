import * as z from "zod/mini";

import type { EnvSource } from "../env";

const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().check(z.minLength(1)),
});

export interface ServerEnv {
  secretKey: string;
}

export function parseServerEnv(source: EnvSource): ServerEnv {
  const result = serverEnvSchema.safeParse({ SUPABASE_SECRET_KEY: source.SUPABASE_SECRET_KEY });
  if (!result.success) {
    throw new Error(
      'Invalid or missing environment variables: SUPABASE_SECRET_KEY. Run "pnpm db:env" or copy .env.example.',
    );
  }
  return { secretKey: result.data.SUPABASE_SECRET_KEY };
}

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv({ SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY });
  return cached;
}
