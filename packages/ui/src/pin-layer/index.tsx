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
}

export function PinLayer({ pins, activeThreadId = null, onSelectPin }: PinLayerProps) {
  return (
    <div
      role="group"
      aria-label="Comment pins"
      style={{ zIndex: Z_INDEX.pins }}
      className="pointer-events-none fixed inset-0"
    >
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
  );
}
