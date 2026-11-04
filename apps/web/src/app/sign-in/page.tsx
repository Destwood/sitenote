import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { describeCallbackError, parseCallbackError } from "../../auth-error";
import { getPublicEnv } from "../../env";
import { Logo } from "../../logo";
import { PUBLIC_BRAND_CLASS, PUBLIC_CANVAS_CLASS, PUBLIC_CARD_CLASS } from "../../public-styles";
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
    <main className={`${PUBLIC_CANVAS_CLASS} flex items-center justify-center px-6 py-16`}>
      <div className={`${PUBLIC_CARD_CLASS} flex w-full max-w-sm flex-col gap-7 p-8`}>
        <Link href="/" className={PUBLIC_BRAND_CLASS}>
          <Logo size={32} />
          Sitenote
        </Link>
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
          <p className="text-sm leading-6 text-neutral-600">
            Enter your email and we will send you a sign-in link.
          </p>
        </header>
        <SignInForm
          next={next}
          googleEnabled={getPublicEnv().googleAuthEnabled}
          initialError={errorKey === null ? null : describeCallbackError(errorKey)}
        />
      </div>
    </main>
  );
}
