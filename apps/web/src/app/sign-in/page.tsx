import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { describeCallbackError, parseCallbackError } from "../../auth-error";
import { getPublicEnv } from "../../env";
import { safeRedirectPath } from "../../safe-redirect";
import { SignInForm } from "../../sign-in-form";
import { createSupabaseServerClient, getAuthenticatedUser } from "../../supabase-server";

export const metadata: Metadata = {
  title: "Sign in | Sitenote",
};

interface SignInPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);

  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (user !== null && !user.isAnonymous) {
    redirect(next);
  }

  const errorKey = parseCallbackError(params.error);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <Link href="/" className="w-fit text-lg font-bold tracking-tight">
          Sitenote
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>
        <p className="text-neutral-600">
          We email you a 6-digit code. New here? Entering your email creates your account.
        </p>
      </header>
      <SignInForm
        next={next}
        googleEnabled={getPublicEnv().googleAuthEnabled}
        initialError={errorKey === null ? null : describeCallbackError(errorKey)}
      />
    </main>
  );
}
