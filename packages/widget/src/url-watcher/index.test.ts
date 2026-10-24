import { afterEach, describe, expect, it, vi } from "vitest";

import { watchPageUrl } from ".";

afterEach(() => {
  Reflect.deleteProperty(window, "navigation");
});

function setup(initial: string | null = "https://example.test/a") {
  let url = initial;
  const onChange = vi.fn();
  const watcher = watchPageUrl({ win: window, readPageUrl: () => url, onChange });
  return {
    watcher,
    onChange,
    go: (next: string | null) => {
      url = next;
    },
  };
}

describe("watchPageUrl", () => {
  it("reports a change when the page differs on popstate", () => {
    const { watcher, onChange, go } = setup();

    go("https://example.test/b");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(onChange).toHaveBeenCalledTimes(1);
    watcher.stop();
  });

  it("does not report events that leave the page unchanged", () => {
    const { watcher, onChange } = setup();

    window.dispatchEvent(new PopStateEvent("popstate"));
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    watcher.check();

    expect(onChange).not.toHaveBeenCalled();
    watcher.stop();
  });

  it("reports each change once", () => {
    const { watcher, onChange, go } = setup();

    go("https://example.test/b");
    watcher.check();
    watcher.check();
    go("https://example.test/c");
    watcher.check();

    expect(onChange).toHaveBeenCalledTimes(2);
    watcher.stop();
  });

  it("reports a change to and from an unreadable address", () => {
    const { watcher, onChange, go } = setup();

    go(null);
    watcher.check();
    go("https://example.test/a");
    watcher.check();

    expect(onChange).toHaveBeenCalledTimes(2);
    watcher.stop();
  });

  it("listens to the Navigation API when the browser has it", () => {
    const navigation = new EventTarget();
    Object.defineProperty(window, "navigation", { configurable: true, value: navigation });
    const { watcher, onChange, go } = setup();

    go("https://example.test/b");
    navigation.dispatchEvent(new Event("currententrychange"));

    expect(onChange).toHaveBeenCalledTimes(1);
    watcher.stop();
    go("https://example.test/c");
    navigation.dispatchEvent(new Event("currententrychange"));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("stops listening when stopped", () => {
    const { watcher, onChange, go } = setup();
    watcher.stop();

    go("https://example.test/b");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(onChange).not.toHaveBeenCalled();
  });
});
