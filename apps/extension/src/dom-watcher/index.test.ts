import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DOM_SETTLE_DELAY_MS, DOM_SETTLE_MAX_WAIT_MS, watchDom } from ".";

let stop: (() => void) | null = null;
let host: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<main id="page"><p id="copy">Text</p></main>';
  host = document.createElement("sitenote-root");
  document.body.append(host);
});

afterEach(() => {
  stop?.();
  stop = null;
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function start() {
  const onSettled = vi.fn();
  stop = watchDom({
    root: document.body,
    isOwn: (node) => node === host || host.contains(node),
    onSettled,
  });
  return onSettled;
}

async function mutate(change: () => void): Promise<void> {
  change();
  await Promise.resolve();
}

describe("watchDom", () => {
  it("reports once after the mutations settle", async () => {
    const onSettled = start();

    await mutate(() => document.querySelector("#copy")?.setAttribute("class", "a"));
    await vi.advanceTimersByTimeAsync(DOM_SETTLE_DELAY_MS - 1);
    expect(onSettled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("restarts the wait while changes keep coming", async () => {
    const onSettled = start();

    await mutate(() => document.querySelector("#copy")?.setAttribute("class", "a"));
    await vi.advanceTimersByTimeAsync(200);
    await mutate(() => document.querySelector("#copy")?.setAttribute("class", "b"));
    await vi.advanceTimersByTimeAsync(200);
    expect(onSettled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60);

    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("fires within the maximum wait even if the page never settles", async () => {
    const onSettled = start();

    for (let elapsed = 0; elapsed < DOM_SETTLE_MAX_WAIT_MS + 500; elapsed += 100) {
      await mutate(() => document.querySelector("#copy")?.setAttribute("data-n", String(elapsed)));
      await vi.advanceTimersByTimeAsync(100);
    }

    expect(onSettled.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("sees added nodes, removed nodes and text changes", async () => {
    const onSettled = start();

    await mutate(() => document.querySelector("#page")?.append(document.createElement("div")));
    await vi.advanceTimersByTimeAsync(DOM_SETTLE_DELAY_MS);
    await mutate(() => document.querySelector("#copy")?.remove());
    await vi.advanceTimersByTimeAsync(DOM_SETTLE_DELAY_MS);
    await mutate(() => {
      const text = document.querySelector("#page")?.firstChild;
      if (text instanceof Text) {
        text.data = "changed";
      }
    });
    await vi.advanceTimersByTimeAsync(DOM_SETTLE_DELAY_MS);

    expect(onSettled.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("ignores changes to the extension host", async () => {
    const onSettled = start();

    await mutate(() => {
      host.setAttribute("data-thread-count", "3");
      host.append(document.createElement("div"));
    });
    await vi.advanceTimersByTimeAsync(DOM_SETTLE_MAX_WAIT_MS);

    expect(onSettled).not.toHaveBeenCalled();
  });

  it("ignores the host being added to or removed from the page", async () => {
    const onSettled = start();

    await mutate(() => {
      host.remove();
      document.body.append(host);
    });
    await vi.advanceTimersByTimeAsync(DOM_SETTLE_MAX_WAIT_MS);

    expect(onSettled).not.toHaveBeenCalled();
  });

  it("stops reporting and drops a pending report when stopped", async () => {
    const onSettled = start();
    await mutate(() => document.querySelector("#copy")?.setAttribute("class", "a"));

    stop?.();
    stop = null;
    await vi.advanceTimersByTimeAsync(DOM_SETTLE_MAX_WAIT_MS);

    expect(onSettled).not.toHaveBeenCalled();
  });
});
