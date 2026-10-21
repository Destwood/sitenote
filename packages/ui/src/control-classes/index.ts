export const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700";

export const PRIMARY_BUTTON = `inline-flex items-center justify-center rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`;

export const SECONDARY_BUTTON = `inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`;

export const ICON_BUTTON = `inline-flex size-7 items-center justify-center rounded-md text-lg leading-none text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 ${FOCUS_RING}`;

export const TEXT_BUTTON = `rounded-sm text-xs font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`;

export const PANEL_SURFACE =
  "rounded-lg border border-neutral-200 bg-white font-sans text-sm text-neutral-900 shadow-xl";

export const DANGER_BUTTON = `inline-flex items-center justify-center rounded-md bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`;
