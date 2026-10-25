import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getPublicEnv } from "../../../env";
import { ExtensionConnect } from "../../../extension-connect";
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
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-8 px-6 py-16">
      <Link href="/" className="w-fit text-lg font-bold tracking-tight">
        Sitenote
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Connect the extension</h1>
        <p className="text-neutral-600">
          You are signed in as <strong className="break-all">{user.email ?? "your account"}</strong>
          . Connecting signs the extension in to the same account. You stay signed in here.
        </p>
      </header>
      <ExtensionConnect extensionId={getPublicEnv().extensionId} />
    </main>
  );
}
