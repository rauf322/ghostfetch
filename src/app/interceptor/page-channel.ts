// The interceptor's private channel to the bridge (src/app/bridge/), which offers it a port once,
// before any page script runs: the response rules arrive over it, and the requests the page makes
// go back over it to the tab's traffic log.
//
// This script runs before any page script, so these are still the browser's own functions.
// The channel handoff below only ever calls these copies, never a property looked up later,
// so a page that patches MessageEvent, EventTarget or MessagePort can't intercept it.
import type { LogEntry } from '../../entities/traffic/index.ts';
import { compile } from './matching.ts';
import type { PageRules } from './types.ts';

const { apply } = Reflect;
const getter = (proto: object, key: string) =>
  Object.getOwnPropertyDescriptor(proto, key)!.get!;
const eventData = getter(MessageEvent.prototype, 'data');
const eventPorts = getter(MessageEvent.prototype, 'ports');
const eventSource = getter(MessageEvent.prototype, 'source');
const setOnMessage = Object.getOwnPropertyDescriptor(
  MessagePort.prototype,
  'onmessage',
)!.set!;
const stopImmediate = Event.prototype.stopImmediatePropagation;
const listen = EventTarget.prototype.addEventListener;
const unlisten = EventTarget.prototype.removeEventListener;
const postToPort = MessagePort.prototype.postMessage;

let port: MessagePort | null = null;
let state: PageRules = { enabled: false, record: false, rules: [], needsBody: false };
let ready = false;
let markReady!: () => void;
// Resolves once the rules have arrived, or the bridge took too long (openChannel()). The page's
// requests wait for it, so even those made while it loads get the rules.
export const whenReady = new Promise<void>((resolve) => {
  markReady = () => {
    ready = true;
    resolve();
  };
});
export const isReady = () => ready;
// The rules as they are now: a new object each time the bridge sends them.
export const pageRules = () => state;

// The bridge offers its port once, before any page script runs. Accept only that first one,
// so a page can't swap in a channel of its own later. The listener is in the capture phase
// and registered first, so it runs ahead of every page listener on window (capture or not)
// and stops the event before the page can see it or its port.
// - isTrusted is an own, unforgeable property of the event, so a MessageEvent the page built
//   and dispatched itself (which would arrive before the real offer) is ignored.
// - The ports array is read by index, never destructured or iterated, so a page that
//   replaced Array.prototype[Symbol.iterator] never gets to see it.
function receivePort(event: MessageEvent) {
  if (!event.isTrusted || apply(eventSource, event, []) !== window) return;
  const offer = apply(eventData, event, []);
  const ports = apply(eventPorts, event, []);
  if (offer?.ghostfetch !== 'port' || ports.length !== 1) return;
  apply(stopImmediate, event, []);
  apply(unlisten, window, ['message', receivePort, true]);
  port = ports[0];
  apply(setOnMessage, port, [
    (message: MessageEvent) => {
      const data = apply(eventData, message, []);
      if (data?.type !== 'state') return;
      const rules = compile(data.rules || []);
      state = {
        enabled: Boolean(data.enabled),
        record: Boolean(data.record),
        rules,
        needsBody:
          Boolean(data.record) ||
          rules.some(({ rule }) => rule.match?.graphqlOperation?.trim()),
      };
      markReady();
    },
  ]);
}

// Listens for the bridge's offer. Called as the script starts, once it knows it runs on this page.
export function openChannel() {
  // Never hold the page's requests hostage if the bridge doesn't answer.
  setTimeout(() => markReady(), 1500);
  apply(listen, window, ['message', receivePort, true]);
}

// Sends the bridge a request the page made, for the traffic log, while recording.
export function report(entry: LogEntry) {
  if (!state.record || !port) return;
  try {
    apply(postToPort, port, [{ type: 'log', entry }]);
  } catch {
    // Port closed (the extension was reloaded).
  }
}
