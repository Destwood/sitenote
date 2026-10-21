import { FOCUS_RING } from "../control-classes";
import { Z_INDEX } from "../z-index";

export interface LauncherProps {
  openCount: number;
  expanded: boolean;
  onClick: () => void;
}

export function Launcher({ openCount, expanded, onClick }: LauncherProps) {
  return (
    <button
      type="button"
      aria-label={`Comments, ${String(openCount)} open`}
      aria-haspopup="true"
      aria-expanded={expanded}
      onClick={onClick}
      style={{ zIndex: Z_INDEX.launcher }}
      className={`fixed right-4 bottom-4 inline-flex cursor-pointer items-center gap-2 rounded-full bg-neutral-900 py-2 pr-2 pl-4 font-sans text-sm font-semibold text-white shadow-lg hover:bg-neutral-700 ${FOCUS_RING}`}
    >
      <span aria-hidden="true">Comments</span>
      <span
        aria-hidden="true"
        data-testid="sitenote-launcher-count"
        className="inline-flex min-w-6 items-center justify-center rounded-full bg-white px-1.5 py-0.5 text-xs font-semibold text-neutral-900"
      >
        {openCount}
      </span>
    </button>
  );
}
