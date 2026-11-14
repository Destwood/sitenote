import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getPublicEnv } from "../../../env";
import { ExtensionConnect } from "../../../extension-connect";
import { Logo } from "../../../logo";
import {
  PUBLIC_BRAND_CLASS,
  PUBLIC_CANVAS_CLASS,
  PUBLIC_CARD_CLASS,
  PUBLIC_LINK_BUTTON_CLASS,
} from "../../../public-styles";
import { createSupabaseServerClient, getAuthenticatedUser } from "../../../supabase-server";

export const metadata: Metadata = {
  title: "Connect the extension | Sitenote",
  robots: { index: false, follow: false },
};

export default async function ExtensionConnectPage() {
  const supabase = await createSupabaseServerClient();
  const user = await getAuthenticatedUser(supabase);
  if (user === null || user.isAnonymous) {
    redirect("/sign-in?next=/extension/connect");
  }

  return (
    <main className={`${PUBLIC_CANVAS_CLASS} flex items-center justify-center px-6 py-16`}>
      <div className={`${PUBLIC_CARD_CLASS} flex w-full max-w-md flex-col gap-7 p-8`}>
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className={PUBLIC_BRAND_CLASS}>
            <Logo size={32} />
            Sitenote
          </Link>
          <Link href="/app/dashboard" className={PUBLIC_LINK_BUTTON_CLASS}>
            Go to dashboard
          </Link>
        </div>
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Connect the extension</h1>
          <p className="text-sm leading-6 text-neutral-600">
            You are signed in as{" "}
            <strong className="break-all">{user.email ?? "your account"}</strong>. Connecting signs
            the extension in to the same account. You stay signed in here.
          </p>
        </header>
        <ExtensionConnect extensionId={getPublicEnv().extensionId} />
      </div>
    </main>
  );
}
