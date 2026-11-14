import { useLayoutEffect, useRef } from "react";

import { Pin } from "../pin";
import type { ThreadStatus } from "../types";
import { Z_INDEX } from "../z-index";

export interface PinLayerPin {
  threadId: string;
  number: number;
  status: ThreadStatus;
  x: number;
  y: number;
  visible: boolean;
  pending?: boolean;
}

export interface PinLayerProps {
  pins: PinLayerPin[];
  activeThreadId?: string | null;
  onSelectPin: (threadId: string) => void;
  zIndex?: number | undefined;
}

export function PinLayer({
  pins,
  activeThreadId = null,
  onSelectPin,
  zIndex = Z_INDEX.pins,
}: PinLayerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const inner = innerRef.current;
    const win = root?.ownerDocument.defaultView;
    if (!root || !inner || !win) {
      return;
    }
    const origin = root.getBoundingClientRect();
    const left = -(origin.left + win.scrollX);
    const top = -(origin.top + win.scrollY);
    inner.style.transform = `translate(${String(left)}px, ${String(top)}px)`;
  });

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label="Comment pins"
      style={{ zIndex }}
      className="pointer-events-none absolute top-0 left-0 h-0 w-0 overflow-visible"
    >
      <div ref={innerRef} className="pointer-events-none absolute top-0 left-0 h-0 w-0">
        {pins
          .filter((pin) => pin.visible)
          .map((pin) => (
            <Pin
              key={pin.threadId}
              number={pin.number}
              status={pin.status}
              x={pin.x}
              y={pin.y}
              active={pin.threadId === activeThreadId}
              pending={pin.pending ?? false}
              onSelect={() => {
                onSelectPin(pin.threadId);
              }}
            />
          ))}
      </div>
    </div>
  );
}
