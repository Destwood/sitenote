import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createStore, useStore } from ".";

describe("createStore", () => {
  it("returns the initial state and applies updates", () => {
    const store = createStore({ count: 1 });

    store.setState((state) => ({ count: state.count + 1 }));

    expect(store.getState()).toEqual({ count: 2 });
  });

  it("notifies subscribers once per change and stops after unsubscribe", () => {
    const store = createStore({ count: 0 });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.setState((state) => ({ count: state.count + 1 }));
    unsubscribe();
    store.setState((state) => ({ count: state.count + 1 }));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not notify when the update returns the same state", () => {
    const store = createStore({ count: 0 });
    const listener = vi.fn();
    store.subscribe(listener);

    store.setState((state) => state);

    expect(listener).not.toHaveBeenCalled();
  });

  it("lets a listener unsubscribe while the listeners are being notified", () => {
    const store = createStore({ count: 0 });
    const second = vi.fn();
    const unsubscribeFirst = store.subscribe(() => {
      unsubscribeFirst();
    });
    store.subscribe(second);

    store.setState((state) => ({ count: state.count + 1 }));

    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("useStore", () => {
  function Counter({ store }: { store: ReturnType<typeof createStore<{ count: number }>> }) {
    const count = useStore(store, (state) => state.count);
    return <p>count {count}</p>;
  }

  it("renders the selected value and re-renders when it changes", () => {
    const store = createStore({ count: 1 });
    render(<Counter store={store} />);

    expect(screen.getByText("count 1")).toBeTruthy();
    act(() => {
      store.setState(() => ({ count: 5 }));
    });

    expect(screen.getByText("count 5")).toBeTruthy();
  });
});
