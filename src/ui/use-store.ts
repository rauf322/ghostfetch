// The one place a store (lib/create-store.ts) meets React, so rules, sites and traffic, which keep
// the stores, stay free of it: the background imports the rules and sites, and the page scripts
// the rules and traffic.
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
