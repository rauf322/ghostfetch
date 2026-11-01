// The editor's live log of a tab's requests (shared/api's createTrafficLog), running for as long
// as the component that starts it is mounted, and two ways to read it: the whole snapshot, for
// the Traffic tab, or one value worked out from it, for a view that only needs that much (a
// rule's count of hits) and so only draws again when that value changes.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createTrafficLog, isPreserved } from '../api/index.ts';
import type { TrafficLog, TrafficSnapshot } from '../api/index.ts';

export function useTrafficLog(followActiveTab: boolean): TrafficLog {
  const [log] = useState(() =>
    createTrafficLog({ followActiveTab, preserve: isPreserved }),
  );
  useEffect(() => {
    log.start();
    return () => log.stop();
  }, [log]);
  return log;
}

export function useTraffic(log: TrafficLog): TrafficSnapshot {
  return useSyncExternalStore(log.subscribe, log.snapshot);
}

// `pick` must return a string, number or boolean, so that the same answer counts as no change.
export function useTrafficValue<Value extends string | number | boolean>(
  log: TrafficLog,
  pick: (traffic: TrafficSnapshot) => Value,
): Value {
  return useSyncExternalStore(log.subscribe, () => pick(log.snapshot()));
}
