// A store for a module that keeps some state of its own, such as shared/api's copies of what's in
// storage: the state, which the module changes in place, then emit()s; subscribe() for listeners;
// and version(), which moves on every change, for React's useSyncExternalStore (shared/react).
// The state is changed in place, so a component can't tell a changed rule from the one it drew; the
// version is what moves.
//
// Export it as `/* @__PURE__ */ createStore(state)` and touch nothing else of it at the top of the
// module: a bundle that imports the module for something else (the background, for the rule model)
// then leaves the store out.
export interface Store<State, Change> {
  state: State;
  subscribe: (listener: (change: Change) => void) => () => void;
  emit: (change: Change) => void;
  version: () => number;
}

export function createStore<State, Change = void>(state: State): Store<State, Change> {
  const listeners = new Set<(change: Change) => void>();
  let version = 0;
  return {
    state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(change) {
      version += 1;
      for (const listener of listeners) listener(change);
    },
    version: () => version,
  };
}
