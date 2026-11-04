const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

const BUTTON_BASE = `inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`;

export const DASH_INPUT_CLASS = `h-9 w-full min-w-0 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 ${FOCUS_RING}`;

export const DASH_LABEL_CLASS = "flex flex-col gap-1.5 text-sm font-medium text-neutral-700";

export const DASH_BUTTON_PRIMARY_CLASS = `${BUTTON_BASE} bg-neutral-900 text-white hover:bg-neutral-800`;

export const DASH_BUTTON_SECONDARY_CLASS = `${BUTTON_BASE} border border-neutral-300 bg-white text-neutral-900 shadow-sm hover:bg-neutral-50`;

export const DASH_BUTTON_DANGER_CLASS = `${BUTTON_BASE} border border-red-200 bg-red-50 text-red-700 hover:bg-red-100`;

export const DASH_LINK_CLASS = `rounded-sm text-sm font-medium text-neutral-600 underline-offset-4 hover:text-neutral-900 hover:underline ${FOCUS_RING}`;

export const DASH_CARD_CLASS = "overflow-hidden rounded-lg border border-neutral-200 bg-white";

export const DASH_EMPTY_CLASS =
  "rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-600";

export const DASH_ERROR_CLASS =
  "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800";
