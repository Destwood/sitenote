import Link from "next/link";

import { SECONDARY_BUTTON_CLASS } from "../form-controls";

interface AppHeaderProps {
  displayName: string;
}

export function AppHeader({ displayName }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-neutral-200 pb-4">
      <Link href="/" className="text-lg font-bold tracking-tight">
        Sitenote
      </Link>
      <div className="flex items-center gap-3">
        <span className="text-sm text-neutral-700" data-testid="display-name">
          {displayName}
        </span>
        <form method="post" action="/auth/sign-out">
          <button type="submit" className={SECONDARY_BUTTON_CLASS}>
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
