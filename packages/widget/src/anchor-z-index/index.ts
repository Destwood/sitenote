export const MAX_Z_INDEX = 2147483647;

export function effectiveZIndex(element: Element, win: Window): number {
  const root = element.ownerDocument.documentElement;
  let max = 0;
  let current: Element | null = element;
  while (current !== null && current !== root) {
    const value = Number.parseInt(win.getComputedStyle(current).zIndex, 10);
    if (!Number.isNaN(value) && value > max) {
      max = value;
    }
    current = current.parentElement;
  }
  return max;
}

export function zIndexAbove(base: number, anchor: number): number {
  return Math.min(MAX_Z_INDEX, Math.max(base, anchor + 1));
}
