import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { Icon } from "../icon";

export interface WorkspacePickerOption {
  id: string;
  name: string;
}

interface WorkspacePickerProps {
  value: string;
  options: readonly WorkspacePickerOption[];
  onChange: (id: string) => void;
  disabled: boolean;
}

const LIST_KEYS = ["ArrowDown", "ArrowUp", "Home", "End", "Enter", " ", "Escape"];

function monogramOf(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

export function WorkspacePicker({ value, options, onChange, disabled }: WorkspacePickerProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const expanded = open && !disabled;
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.id === value),
  );
  const selectedName = options[selectedIndex]?.name ?? "";
  const last = options.length - 1;

  function optionId(index: number): string {
    return `${listId}-${String(index)}`;
  }

  function openList() {
    setActive(selectedIndex);
    setOpen(true);
  }

  function close(focusTrigger: boolean) {
    setOpen(false);
    if (focusTrigger) {
      triggerRef.current?.focus();
    }
  }

  function choose(index: number) {
    const option = options[index];
    if (option === undefined) {
      return;
    }
    onChange(option.id);
    close(true);
  }

  useEffect(() => {
    if (expanded) {
      listRef.current?.focus();
    }
  }, [expanded]);

  useEffect(() => {
    if (expanded) {
      document.getElementById(`${listId}-${String(active)}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [active, expanded, listId]);

  useEffect(() => {
    if (!expanded) {
      return;
    }
    function handleMouseDown(event: MouseEvent) {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [expanded]);

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" && !expanded) {
      event.preventDefault();
      openList();
    }
  }

  function handleListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key === "Tab") {
      close(true);
      return;
    }
    if (!LIST_KEYS.includes(event.key)) {
      return;
    }
    event.preventDefault();
    switch (event.key) {
      case "ArrowDown":
        setActive(Math.min(active + 1, last));
        break;
      case "ArrowUp":
        setActive(Math.max(active - 1, 0));
        break;
      case "Home":
        setActive(0);
        break;
      case "End":
        setActive(last);
        break;
      case "Enter":
      case " ":
        choose(active);
        break;
      case "Escape":
        event.stopPropagation();
        close(true);
        break;
    }
  }

  return (
    <div ref={rootRef} className="rounded-b-lg border-t border-neutral-200 bg-neutral-50">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        onClick={() => {
          if (expanded) {
            close(false);
          } else {
            openList();
          }
        }}
        onKeyDown={handleTriggerKeyDown}
        className="flex w-full min-w-0 items-center gap-2.5 rounded-b-lg px-2.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-[11px] font-bold text-white"
        >
          {monogramOf(selectedName)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[11px] text-neutral-500">Workspace</span>
          <span className="truncate text-[13px] font-semibold text-neutral-900">
            {selectedName}
          </span>
        </span>
        <Icon
          name="chevron"
          size={14}
          className={`shrink-0 text-neutral-500 transition-transform ${expanded ? "-rotate-90" : "rotate-90"}`}
        />
      </button>
      {expanded ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Workspace"
          tabIndex={-1}
          aria-activedescendant={optionId(active)}
          onKeyDown={handleListKeyDown}
          className="mx-1.5 mb-1.5 max-h-40 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          {options.map((option, index) => {
            const isSelected = option.id === value;
            return (
              <li
                key={option.id}
                id={optionId(index)}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  choose(index);
                }}
                onMouseEnter={() => {
                  setActive(index);
                }}
                className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-[13px] text-neutral-900 ${index === active ? "bg-neutral-100" : ""}`}
              >
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-[11px] font-bold text-white"
                >
                  {monogramOf(option.name)}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">{option.name}</span>
                {isSelected ? (
                  <Icon name="check" size={14} className="shrink-0 text-blue-700" />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
