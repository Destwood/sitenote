import { afterEach, describe, expect, it, vi } from "vitest";

import { ISOLATED_EVENTS, isolateEvents } from ".";

afterEach(() => {
  document.body.innerHTML = "";
});

function setup() {
  const container = document.createElement("div");
  const child = document.createElement("button");
  container.append(child);
  document.body.append(container);
  const onDocument = vi.fn();
  for (const type of ISOLATED_EVENTS) {
    document.addEventListener(type, onDocument);
  }
  return {
    container,
    child,
    onDocument,
    cleanup: () => {
      for (const type of ISOLATED_EVENTS) {
        document.removeEventListener(type, onDocument);
      }
    },
  };
}

describe("isolateEvents", () => {
  it("keeps keyboard and pointer events inside the container", () => {
    const { container, child, onDocument, cleanup } = setup();
    isolateEvents(container);

    for (const type of ISOLATED_EVENTS) {
      child.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
    }

    expect(onDocument).not.toHaveBeenCalled();
    cleanup();
  });

  it("still lets listeners inside the container see the events", () => {
    const { container, child, cleanup } = setup();
    isolateEvents(container);
    const inside = vi.fn();
    container.addEventListener("keydown", inside);

    child.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true }));

    expect(inside).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("lets events through again after cleanup", () => {
    const { container, child, onDocument, cleanup } = setup();
    isolateEvents(container)();

    child.dispatchEvent(new Event("click", { bubbles: true }));

    expect(onDocument).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("does not touch other events", () => {
    const { container, child, cleanup } = setup();
    isolateEvents(container);
    const onFocus = vi.fn();
    document.addEventListener("focusin", onFocus);

    child.dispatchEvent(new Event("focusin", { bubbles: true }));

    expect(onFocus).toHaveBeenCalledTimes(1);
    document.removeEventListener("focusin", onFocus);
    cleanup();
  });
});
