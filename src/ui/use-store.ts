// The one place a store (lib/create-store.ts) meets React, so shared/api and sites, which keep
// the stores, stay free of it: the background imports both, and the page scripts shared/api.
import { useSyncExternalStore } from 'react';

// A store as a screen sees it: its state, and its change notifications.
export interface ObservedStore<State> {
  state: State;
  subscribe: (listener: () => void) => () => void;
  version: () => number;
}

// Redraws the component after every change to the store, made here or in another view, and
// returns its state for the component to read while it renders.
export function useStore<State>(store: ObservedStore<State>): State {
  useSyncExternalStore(store.subscribe, store.version);
  return store.state;
}
