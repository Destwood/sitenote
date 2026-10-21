import { FOCUS_RING } from "../control-classes";
import { Z_INDEX } from "../z-index";

export interface CommentModeBannerProps {
  onExit: () => void;
}

export function CommentModeBanner({ onExit }: CommentModeBannerProps) {
  return (
    <div
      role="status"
      style={{ zIndex: Z_INDEX.banner }}
      className="pointer-events-auto fixed inset-x-0 top-3 mx-auto flex w-fit max-w-[calc(100vw-32px)] items-center gap-3 rounded-full bg-neutral-900 py-1.5 pr-1.5 pl-4 font-sans text-sm text-white shadow-lg"
    >
      <span>Comment mode: click an element or select text · Esc to exit</span>
      <button
        type="button"
        onClick={onExit}
        className={`rounded-full bg-white px-3 py-1 text-sm font-semibold text-neutral-900 hover:bg-neutral-200 ${FOCUS_RING}`}
      >
        Exit
      </button>
    </div>
  );
}
