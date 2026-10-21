import { useSyncExternalStore } from "react";

export interface Store<State> {
  getState: () => State;
  setState: (update: (state: State) => State) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createStore<State>(initial: State): Store<State> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    setState: (update) => {
      const next = update(state);
      if (Object.is(next, state)) {
        return;
      }
      state = next;
      for (const listener of [...listeners]) {
        listener();
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useStore<State, Selected>(
  store: Store<State>,
  selector: (state: State) => Selected,
): Selected {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}
