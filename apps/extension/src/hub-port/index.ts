import type { PageEvent } from "../messages";
import type { RouterSender } from "../message-router";
import { senderOriginOf } from "../message-router";
import type { HubPort } from "../realtime-hub";

export interface PortLike {
  sender?: RouterSender | undefined;
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

export function createHubPort(port: PortLike, extensionId: string): HubPort {
  const sender = port.sender;
  const trusted = sender?.id === extensionId && sender.tab !== undefined;
  return {
    origin: trusted ? senderOriginOf(sender) : null,
    post: (event: PageEvent) => {
      port.postMessage(event);
    },
    disconnect: () => {
      port.disconnect();
    },
    onMessage: (handler) => {
      port.onMessage.addListener(handler);
    },
    onDisconnect: (handler) => {
      port.onDisconnect.addListener(handler);
    },
  };
}
