import Link from "next/link";

import { LINK_BUTTON_CLASS } from "../form-controls";

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
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-sm">
      {previousHref === null ? (
        <span className="text-neutral-400">Previous</span>
      ) : (
        <Link href={previousHref} className={LINK_BUTTON_CLASS}>
          Previous
        </Link>
      )}
      <span className="text-neutral-700">
        Page {page} of {pages}
      </span>
      {nextHref === null ? (
        <span className="text-neutral-400">Next</span>
      ) : (
        <Link href={nextHref} className={LINK_BUTTON_CLASS}>
          Next
        </Link>
      )}
    </nav>
  );
}
