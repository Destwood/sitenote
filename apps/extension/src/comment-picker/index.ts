import type { AnchorRect } from "@sitenote/ui";

export interface PickerHover {
  element: Element;
  rect: AnchorRect;
}

export interface PickPoint {
  clientX: number;
  clientY: number;
}

export interface PickerDeps {
  doc: Document;
  win: Window;
  isOwn: (node: Node | null) => boolean;
  onHover: (hover: PickerHover | null) => void;
  onPick: (element: Element, point: PickPoint) => void;
  requestFrame?: (callback: () => void) => number;
  cancelFrame?: (handle: number) => void;
}

export interface Picker {
  enable: () => void;
  disable: () => void;
}

function sameRect(a: AnchorRect, b: AnchorRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function createPicker(deps: PickerDeps): Picker {
  const { doc, win } = deps;
  const requestFrame = deps.requestFrame ?? ((callback) => win.requestAnimationFrame(callback));
  const cancelFrame =
    deps.cancelFrame ??
    ((handle) => {
      win.cancelAnimationFrame(handle);
    });

  let enabled = false;
  let point: PickPoint | null = null;
  let frame: number | null = null;
  let hover: PickerHover | null = null;

  function targetAt(clientX: number, clientY: number): Element | null {
    const element = doc.elementFromPoint(clientX, clientY);
    if (
      element === null ||
      deps.isOwn(element) ||
      element === doc.documentElement ||
      element === doc.body
    ) {
      return null;
    }
    return element;
  }

  function setHover(next: PickerHover | null): void {
    const unchanged =
      next === hover ||
      (next !== null &&
        hover !== null &&
        next.element === hover.element &&
        sameRect(next.rect, hover.rect));
    if (!unchanged) {
      hover = next;
      deps.onHover(next);
    }
  }

  function updateHover(): void {
    frame = null;
    const element = point === null ? null : targetAt(point.clientX, point.clientY);
    if (element === null) {
      setHover(null);
      return;
    }
    const rect = element.getBoundingClientRect();
    setHover({
      element,
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    });
  }

  function scheduleHover(): void {
    frame ??= requestFrame(updateHover);
  }

  function handleMove(event: MouseEvent): void {
    point = { clientX: event.clientX, clientY: event.clientY };
    scheduleHover();
  }

  function handleLeave(): void {
    point = null;
    scheduleHover();
  }

  function handleClick(event: MouseEvent): void {
    if (deps.isOwn(event.target as Node | null)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const selection = win.getSelection();
    if (event.detail === 0 || (selection !== null && !selection.isCollapsed)) {
      return;
    }
    const element = targetAt(event.clientX, event.clientY);
    if (element !== null) {
      deps.onPick(element, { clientX: event.clientX, clientY: event.clientY });
    }
  }

  return {
    enable: () => {
      if (enabled) {
        return;
      }
      enabled = true;
      doc.addEventListener("mousemove", handleMove, { capture: true, passive: true });
      doc.addEventListener("scroll", scheduleHover, { capture: true, passive: true });
      doc.documentElement.addEventListener("mouseleave", handleLeave, { passive: true });
      doc.addEventListener("click", handleClick, { capture: true });
    },
    disable: () => {
      if (!enabled) {
        return;
      }
      enabled = false;
      doc.removeEventListener("mousemove", handleMove, { capture: true });
      doc.removeEventListener("scroll", scheduleHover, { capture: true });
      doc.documentElement.removeEventListener("mouseleave", handleLeave);
      doc.removeEventListener("click", handleClick, { capture: true });
      if (frame !== null) {
        cancelFrame(frame);
        frame = null;
      }
      point = null;
      setHover(null);
    },
  };
}
