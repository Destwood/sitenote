import { describe, expect, it, vi } from "vitest";

import { createHubPort, type PortLike } from ".";

const EXTENSION_ID = "anefihllkbkenhjbjggfndgemgkfaeoa";

function createPort(sender: PortLike["sender"]) {
  const messageListeners: ((message: unknown) => void)[] = [];
  const disconnectListeners: (() => void)[] = [];
  const postMessage = vi.fn();
  const disconnect = vi.fn();
  const port: PortLike = {
    sender,
    postMessage,
    disconnect,
    onMessage: { addListener: (listener) => messageListeners.push(listener) },
    onDisconnect: { addListener: (listener) => disconnectListeners.push(listener) },
  };
  return { port, postMessage, disconnect, messageListeners, disconnectListeners };
}

describe("createHubPort", () => {
  it("derives the origin of a content script port", () => {
    const { port } = createPort({
      id: EXTENSION_ID,
      url: "https://example.test/pricing?x=1#y",
      tab: { id: 3 },
    });

    expect(createHubPort(port, EXTENSION_ID).origin).toBe("https://example.test");
  });

  it.each([
    ["another extension", { id: "other", url: "https://example.test/", tab: { id: 3 } }],
    ["a sender without a tab", { id: EXTENSION_ID, url: "https://example.test/" }],
    ["a sender without a url", { id: EXTENSION_ID, tab: { id: 3 } }],
    ["a sender with an unparseable url", { id: EXTENSION_ID, url: "nope", tab: { id: 3 } }],
    ["no sender", undefined],
  ])("has no origin for %s", (_name, sender) => {
    expect(createHubPort(createPort(sender).port, EXTENSION_ID).origin).toBeNull();
  });

  it("forwards posts, disconnects and listeners to the port", () => {
    const { port, postMessage, disconnect, messageListeners, disconnectListeners } = createPort({
      id: EXTENSION_ID,
      url: "https://example.test/",
      tab: { id: 3 },
    });
    const hubPort = createHubPort(port, EXTENSION_ID);
    const onMessage = vi.fn();
    const onDisconnect = vi.fn();

    hubPort.post({ type: "page.subscribed" });
    hubPort.disconnect();
    hubPort.onMessage(onMessage);
    hubPort.onDisconnect(onDisconnect);
    messageListeners[0]?.({ type: "x" });
    disconnectListeners[0]?.();

    expect(postMessage).toHaveBeenCalledWith({ type: "page.subscribed" });
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({ type: "x" });
    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });
});
