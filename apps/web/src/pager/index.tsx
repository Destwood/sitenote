import Link from "next/link";

import { DASH_BUTTON_SECONDARY_CLASS } from "../dashboard-classes";

interface PagerProps {
  page: number;
  pages: number;
  previousHref: string | null;
  nextHref: string | null;
}

export function Pager({ page, pages, previousHref, nextHref }: PagerProps) {
  if (pages <= 1) {
    return null;
  }

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3 text-sm"
    >
      {previousHref === null ? (
        <span className={`${DASH_BUTTON_SECONDARY_CLASS} opacity-50`}>Previous</span>
      ) : (
        <Link href={previousHref} className={DASH_BUTTON_SECONDARY_CLASS}>
          Previous
        </Link>
      )}
      <span className="text-neutral-600">
        Page {page} of {pages}
      </span>
      {nextHref === null ? (
        <span className={`${DASH_BUTTON_SECONDARY_CLASS} opacity-50`}>Next</span>
      ) : (
        <Link href={nextHref} className={DASH_BUTTON_SECONDARY_CLASS}>
          Next
        </Link>
      )}
    </nav>
  );
}
