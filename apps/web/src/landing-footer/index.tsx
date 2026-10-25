import Link from "next/link";

const LINK_CLASS =
  "rounded-sm hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900";

interface LandingFooterProps {
  signedIn: boolean;
}

export function LandingFooter({ signedIn }: LandingFooterProps) {
  return (
    <footer className="border-t border-neutral-200">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-neutral-600">
        <p>Sitenote: Figma-style comments on any live website.</p>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
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
            <li>
              <a href="#faq" className={LINK_CLASS}>
                Questions
              </a>
            </li>
            <li>
              <Link href={signedIn ? "/app" : "/sign-in"} className={LINK_CLASS}>
                {signedIn ? "Dashboard" : "Sign in"}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
