import Link from "next/link";

import { Logo } from "../logo";
import { PUBLIC_FOCUS_CLASS } from "../public-styles";

const LINK_CLASS = `rounded-sm text-neutral-600 transition-colors hover:text-neutral-900 ${PUBLIC_FOCUS_CLASS}`;

interface LandingFooterProps {
  signedIn: boolean;
  basePath?: string;
}

export function LandingFooter({ signedIn, basePath = "" }: LandingFooterProps) {
  return (
    <footer className="border-t border-neutral-200 bg-neutral-50">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-6 py-10 text-sm text-neutral-600">
        <p className="flex items-center gap-2.5">
          <Logo size={24} />
          Sitenote: Figma-style comments on any live website.
        </p>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            <li>
              <a href={`${basePath}#features`} className={LINK_CLASS}>
                Features
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
            <li>
              <a href={`${basePath}#faq`} className={LINK_CLASS}>
                Questions
              </a>
            </li>
            <li>
              <Link href={signedIn ? "/app/dashboard" : "/sign-in"} className={LINK_CLASS}>
                {signedIn ? "Dashboard" : "Sign in"}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
