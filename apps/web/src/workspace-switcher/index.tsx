"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { DashIcon } from "../dashboard-icons";
import { workspaceSwitchPath } from "../workspace-paths";

export interface WorkspaceSwitcherItem {
  id: string;
  name: string;
}

interface WorkspaceSwitcherProps {
  currentId: string;
  workspaces: readonly WorkspaceSwitcherItem[];
}

export function WorkspaceSwitcher({ currentId, workspaces }: WorkspaceSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const labelId = useId();
  const valueId = useId();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedIndex = Math.max(
    0,
    workspaces.findIndex((workspace) => workspace.id === currentId),
  );
  const selected = workspaces[selectedIndex];
  const lastIndex = workspaces.length - 1;

  useEffect(() => {
    if (!open) {
      return;
    }
    optionRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function closeOnOutsideClick(event: MouseEvent) {
      if (!(event.target instanceof Node) || !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
    };
  }, [open]);

  function openList() {
    setActiveIndex(selectedIndex);
    setOpen(true);
  }

  function closeList(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }

  function choose(index: number) {
    const workspace = workspaces[index];
    closeList(true);
    if (workspace === undefined || workspace.id === currentId) {
      return;
    }
    router.push(workspaceSwitchPath(pathname, workspace.id));
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openList();
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, lastIndex));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(lastIndex);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(activeIndex);
        break;
      case "Escape":
        event.preventDefault();
        closeList(true);
        break;
      case "Tab":
        closeList(false);
        break;
    }
  }

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1.5">
      <span id={labelId} className="text-xs font-medium text-neutral-500">
        Workspace
      </span>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-labelledby={labelId}
        aria-describedby={valueId}
        onClick={() => {
          if (open) {
            closeList(false);
          } else {
            openList();
          }
        }}
        onKeyDown={onTriggerKeyDown}
        className="flex w-full items-center gap-2.5 rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-left shadow-sm hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-xs font-semibold text-white">
          {selected?.name.trim().charAt(0).toUpperCase() ?? ""}
        </span>
        <span id={valueId} className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900">
          {selected?.name ?? ""}
        </span>
        <DashIcon name="chevron" className="size-4 text-neutral-500" />
      </button>
      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-labelledby={labelId}
          tabIndex={-1}
          onKeyDown={onListKeyDown}
          className="absolute top-full right-0 left-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1 shadow-lg"
        >
          {workspaces.map((workspace, index) => {
            const isSelected = workspace.id === currentId;
            return (
              <li
                key={workspace.id}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                onClick={() => {
                  choose(index);
                }}
                className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm outline-none focus:bg-neutral-100 ${
                  isSelected ? "font-semibold text-neutral-900" : "text-neutral-700"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                {isSelected ? (
                  <DashIcon name="check" className="size-3.5 text-neutral-900" />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
