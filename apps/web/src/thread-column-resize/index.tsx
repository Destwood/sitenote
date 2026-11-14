"use client";

import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";

export type ThreadColumnWidthId =
  | "domain"
  | "route"
  | "firstComment"
  | "type"
  | "author"
  | "status"
  | "comments"
  | "created"
  | "lastActivity";

export const THREAD_COLUMN_DEFAULT_WIDTHS: Readonly<Record<ThreadColumnWidthId, number>> = {
  domain: 160,
  route: 240,
  firstComment: 320,
  type: 100,
  author: 140,
  status: 110,
  comments: 110,
  created: 170,
  lastActivity: 170,
};

export const THREAD_COLUMN_MIN_WIDTH = 64;
export const THREAD_COLUMN_MAX_WIDTH = 800;

const KEYBOARD_STEP = 16;
const STORAGE_KEY = "sitenote.thread-column-widths";

function clampWidth(width: number): number {
  return Math.min(THREAD_COLUMN_MAX_WIDTH, Math.max(THREAD_COLUMN_MIN_WIDTH, Math.round(width)));
}

function isWidthId(id: string): id is ThreadColumnWidthId {
  return Object.hasOwn(THREAD_COLUMN_DEFAULT_WIDTHS, id);
}

export function readSavedWidths(): Partial<Record<ThreadColumnWidthId, number>> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const widths: Partial<Record<ThreadColumnWidthId, number>> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (
        isWidthId(id) &&
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= THREAD_COLUMN_MIN_WIDTH &&
        value <= THREAD_COLUMN_MAX_WIDTH
      ) {
        widths[id] = value;
      }
    }
    return widths;
  } catch {
    return {};
  }
}

function saveWidth(columnId: ThreadColumnWidthId, width: number) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...readSavedWidths(), [columnId]: width }),
    );
  } catch {
    return;
  }
}

function findCol(targetId: string, columnId: ThreadColumnWidthId): HTMLTableColElement | null {
  return document
    .getElementById(targetId)
    ?.querySelector<HTMLTableColElement>(`col[data-col="${columnId}"]`) ?? null;
}

function syncTableWidth(targetId: string) {
  const target = document.getElementById(targetId);
  const table = target?.querySelector<HTMLTableElement>("table");
  if (!target || !table) {
    return;
  }
  let total = 0;
  for (const col of target.querySelectorAll<HTMLTableColElement>("col")) {
    if (getComputedStyle(col).display !== "none") {
      total += parseFloat(col.style.width) || 0;
    }
  }
  table.style.width = `${String(total)}px`;
}

function applyWidth(targetId: string, columnId: ThreadColumnWidthId, width: number) {
  const col = findCol(targetId, columnId);
  if (col) {
    col.style.width = `${String(width)}px`;
  }
  syncTableWidth(targetId);
}

interface ThreadColumnResizeHandleProps {
  targetId: string;
  columnId: ThreadColumnWidthId;
  label: string;
}

export function ThreadColumnResizeHandle({ targetId, columnId, label }: ThreadColumnResizeHandleProps) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const saved = readSavedWidths()[columnId];
    if (saved !== undefined) {
      applyWidth(targetId, columnId, saved);
    }
    const target = document.getElementById(targetId);
    if (target === null) {
      return;
    }
    const observer = new MutationObserver(() => {
      syncTableWidth(targetId);
    });
    observer.observe(target, { attributes: true, attributeFilter: ["data-hidden-cols"] });
    return () => {
      observer.disconnect();
    };
  }, [targetId, columnId]);

  function currentWidth(handle: HTMLElement): number {
    const width = parseFloat(findCol(targetId, columnId)?.style.width ?? "");
    if (Number.isFinite(width)) {
      return width;
    }
    return handle.closest("th")?.getBoundingClientRect().width ?? THREAD_COLUMN_DEFAULT_WIDTHS[columnId];
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }
    drag.current = { startX: event.clientX, startWidth: currentWidth(event.currentTarget) };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (current === null) {
      return;
    }
    applyWidth(targetId, columnId, clampWidth(current.startWidth + event.clientX - current.startX));
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current === null) {
      return;
    }
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    saveWidth(columnId, currentWidth(event.currentTarget));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -KEYBOARD_STEP : KEYBOARD_STEP;
    const next = clampWidth(currentWidth(event.currentTarget) + delta);
    applyWidth(targetId, columnId, next);
    saveWidth(columnId, next);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label} column`}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      className="absolute inset-y-0 right-0 w-1.5 touch-none cursor-col-resize select-none hover:bg-blue-400/60 focus-visible:bg-blue-400/60 focus-visible:outline-none"
    />
  );
}
