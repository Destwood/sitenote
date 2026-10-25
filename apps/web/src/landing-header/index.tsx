import Link from "next/link";

import { SECONDARY_BUTTON_CLASS } from "../form-controls";

const LINK_CLASS =
  "rounded-sm hover:text-neutral-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900";
const SKIP_LINK_CLASS =
  "sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-20 focus:rounded-md focus:bg-neutral-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white";

interface LandingHeaderProps {
  githubUrl: string | null;
  signedIn: boolean;
}

export function LandingHeader({ githubUrl, signedIn }: LandingHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur">
      <a href="#main" className={SKIP_LINK_CLASS}>
        Skip to content
      </a>
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-4"
      >
        <Link href="/" className="rounded-sm text-lg font-bold tracking-tight">
          Sitenote
        </Link>
        <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium text-neutral-800">
          <li>
            <a href="#features" className={LINK_CLASS}>
              Features
            </a>
          </li>
          <li>
            <Link href="/demo" className={LINK_CLASS}>
              Demo
            </Link>
          </li>
          <li>
            <a href="#install" className={LINK_CLASS}>
              Install
            </a>
          </li>
          {githubUrl !== null && (
            <li>
              <a href={githubUrl} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
                GitHub
              </a>
            </li>
          )}
          <li>
            <Link href={signedIn ? "/app" : "/sign-in"} className={SECONDARY_BUTTON_CLASS}>
              {signedIn ? "Dashboard" : "Sign in"}
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
