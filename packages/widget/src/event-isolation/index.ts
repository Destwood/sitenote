export const ISOLATED_EVENTS = [
  "keydown",
  "keyup",
  "keypress",
  "mousedown",
  "mouseup",
  "click",
  "dblclick",
  "pointerdown",
  "pointerup",
  "contextmenu",
] as const;

function stop(event: Event): void {
  event.stopPropagation();
}

export function isolateEvents(container: HTMLElement): () => void {
  for (const type of ISOLATED_EVENTS) {
    container.addEventListener(type, stop);
  }
  return () => {
    for (const type of ISOLATED_EVENTS) {
      container.removeEventListener(type, stop);
    }
  };
}
