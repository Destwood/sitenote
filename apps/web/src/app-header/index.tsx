import Link from "next/link";

import { Avatar } from "../avatar";
import { BrandLink } from "../brand-mark";
import { DASH_BUTTON_SECONDARY_CLASS, DASH_LINK_CLASS } from "../dashboard-classes";
import { EXTENSION_DOWNLOAD_URL } from "../extension-download";

interface AppHeaderProps {
  displayName: string;
  canConnectExtension: boolean;
}

interface AccountActionsProps {
  canConnectExtension: boolean;
}

interface SignOutFormProps {
  className?: string;
}

function SignOutForm({ className }: SignOutFormProps) {
  return (
    <form method="post" action="/auth/sign-out" className={className}>
      <button type="submit" className={DASH_BUTTON_SECONDARY_CLASS}>
        Sign out
      </button>
    </form>
  );
}

function AccountActions({ canConnectExtension }: AccountActionsProps) {
  return (
    <>
      {canConnectExtension ? (
        <>
          <Link href="/extension/connect" className={DASH_LINK_CLASS}>
            Connect the extension
          </Link>
          <a href={EXTENSION_DOWNLOAD_URL} download className={DASH_LINK_CLASS}>
            Download extension
          </a>
        </>
      ) : null}
      <SignOutForm />
    </>
  );
}

export function AppHeader({ displayName, canConnectExtension }: AppHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3 sm:px-6">
      <BrandLink />
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-neutral-700" data-testid="display-name">
          {displayName}
        </span>
        <AccountActions canConnectExtension={canConnectExtension} />
      </div>
    </header>
  );
}

export function AppAccount({ displayName, canConnectExtension }: AppHeaderProps) {
  return (
    <div className="flex flex-col gap-3">
      {canConnectExtension ? (
        <>
          <Link href="/extension/connect" className={DASH_LINK_CLASS}>
            Connect the extension
          </Link>
          <a href={EXTENSION_DOWNLOAD_URL} download className={DASH_LINK_CLASS}>
            Download extension
          </a>
        </>
      ) : null}
      <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={displayName} />
          <span
            className="min-w-0 truncate text-sm font-medium text-neutral-900"
            data-testid="display-name"
          >
            {displayName}
          </span>
        </div>
        <SignOutForm className="shrink-0" />
      </div>
    </div>
  );
}
