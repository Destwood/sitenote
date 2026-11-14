import Link from "next/link";

import { Logo } from "../logo";
import {
  PUBLIC_BRAND_CLASS,
  PUBLIC_FOCUS_CLASS,
  PUBLIC_PRIMARY_BUTTON_CLASS,
} from "../public-styles";

const LINK_CLASS = `rounded-sm text-neutral-600 transition-colors hover:text-neutral-900 ${PUBLIC_FOCUS_CLASS}`;
const SKIP_LINK_CLASS =
  "sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-20 focus:rounded-md focus:bg-neutral-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white";

interface LandingHeaderProps {
  githubUrl: string | null;
  signedIn: boolean;
  basePath?: string;
}

export function LandingHeader({ githubUrl, signedIn, basePath = "" }: LandingHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <a href={`${basePath}#main`} className={SKIP_LINK_CLASS}>
        Skip to content
      </a>
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-3.5"
      >
        <Link href="/" className={PUBLIC_BRAND_CLASS}>
          <Logo size={28} />
          Sitenote
        </Link>
        <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium">
          <li>
            <a href={`${basePath}#features`} className={LINK_CLASS}>
              Features
            </a>
          </li>
          <li>
            <a href={`${basePath}#how-it-works`} className={LINK_CLASS}>
              How it works
            </a>
          </li>
          <li>
            <Link href="/demo" className={LINK_CLASS}>
              Demo
            </Link>
          </li>
          <li>
            <a href={`${basePath}#install`} className={LINK_CLASS}>
              Download
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
            <Link
              href={signedIn ? "/app/dashboard" : "/sign-in"}
              className={`${PUBLIC_PRIMARY_BUTTON_CLASS} px-3.5 py-2`}
            >
              {signedIn ? "Dashboard" : "Sign in"}
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
