import { useEffect, useEffectEvent, useState } from "react";

import { FOCUS_RING, ICON_BUTTON } from "../control-classes";
import { Z_INDEX } from "../z-index";

export const TOAST_AUTO_DISMISS_MS = 5000;

export type ToastVariant = "info" | "error";

export interface ToastView {
  id: string;
  message: string;
  variant: ToastVariant;
  onRetry?: () => void;
}

export interface ToastProps {
  toast: ToastView;
  onDismiss: (id: string) => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const [paused, setPaused] = useState(false);
  const isError = toast.variant === "error";
  const { id } = toast;

  const expire = useEffectEvent(() => {
    onDismiss(id);
  });

  useEffect(() => {
    if (isError || paused) {
      return;
    }
    const timer = setTimeout(expire, TOAST_AUTO_DISMISS_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [isError, paused]);

  return (
    <div
      data-variant={toast.variant}
      onMouseEnter={() => {
        setPaused(true);
      }}
      onMouseLeave={() => {
        setPaused(false);
      }}
      onFocus={() => {
        setPaused(true);
      }}
      onBlur={() => {
        setPaused(false);
      }}
      className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 font-sans text-sm shadow-lg ${isError ? "border-red-200 bg-red-50 text-red-900" : "border-neutral-200 bg-white text-neutral-900"}`}
    >
      <p className="min-w-0 flex-1 py-0.5 break-words">
        {isError ? <span className="sr-only">Error: </span> : null}
        {toast.message}
      </p>
      {toast.onRetry === undefined ? null : (
        <button
          type="button"
          onClick={() => {
            toast.onRetry?.();
            onDismiss(id);
          }}
          className={`rounded-md px-2 py-1 text-sm font-semibold text-red-900 underline underline-offset-2 hover:bg-red-100 ${FOCUS_RING}`}
        >
          Retry
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => {
          onDismiss(id);
        }}
        className={ICON_BUTTON}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

export interface ToastRegionProps {
  toasts: ToastView[];
  onDismiss: (id: string) => void;
}

export function ToastRegion({ toasts, onDismiss }: ToastRegionProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-relevant="additions text"
      style={{ zIndex: Z_INDEX.toast }}
      className="pointer-events-none fixed inset-x-0 bottom-4 mx-auto flex w-96 max-w-[calc(100vw-32px)] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
