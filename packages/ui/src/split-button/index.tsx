import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { FOCUS_RING, PANEL_SURFACE, SECONDARY_BUTTON } from "../control-classes";

export interface SplitButtonProps<Value extends string> {
  value: Value;
  options: readonly { value: Value; label: string }[];
  children: ReactNode;
  onAction: () => void;
  onSelect: (value: Value) => void;
  chooseLabel: string;
  menuLabel: string;
  menuTitle?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
}

export function SplitButton<Value extends string>({
  value,
  options,
  children,
  onAction,
  onSelect,
  chooseLabel,
  menuLabel,
  menuTitle,
  disabled = false,
  className,
  buttonClassName = SECONDARY_BUTTON,
}: SplitButtonProps<Value>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    itemRefs.current[options.findIndex((option) => option.value === value)]?.focus();
  }, [open, value, options]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handlePointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (root !== null && !event.composedPath().includes(root)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [open]);

  function close() {
    setOpen(false);
    chevronRef.current?.focus();
  }

  function choose(next: Value) {
    close();
    onSelect(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) {
      return;
    }
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const items = itemRefs.current;
      const index = items.findIndex((item) => item === event.target);
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    }
  }

  return (
    <div
      ref={rootRef}
      onKeyDown={handleKeyDown}
      className={`relative inline-flex ${className ?? ""}`}
    >
      <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        className={`${buttonClassName} rounded-r-none`}
      >
        {children}
      </button>
      <button
        ref={chevronRef}
        type="button"
        aria-label={chooseLabel}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open && !disabled}
        aria-controls={open && !disabled ? menuId : undefined}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className={`${buttonClassName} rounded-l-none border-l-0 px-2`}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4">
          <path
            d="m6 8 4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && !disabled ? (
        <div
          id={menuId}
          role="menu"
          aria-label={menuLabel}
          className={`absolute top-full left-0 z-10 mt-1 w-40 p-1 ${PANEL_SURFACE}`}
        >
          {menuTitle === undefined ? null : (
            <div className="px-2 py-1.5 text-xs font-semibold text-neutral-600">{menuTitle}</div>
          )}
          {options.map((item, index) => (
            <button
              key={item.value}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={value === item.value}
              disabled={disabled}
              onClick={() => {
                choose(item.value);
              }}
              className={`block w-full rounded-sm px-2 py-1.5 text-left hover:bg-neutral-100 ${FOCUS_RING}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
