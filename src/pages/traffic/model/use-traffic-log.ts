// The Traffic tab's live log (traffic-log.ts), running for as long as the tab is mounted, and what
// it holds now: the component that calls this draws again whenever that changes.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { isPreserved } from './preserve.ts';
import { createTrafficLog } from './traffic-log.ts';

export function useTrafficLog(followActiveTab: boolean) {
  const [log] = useState(() =>
    createTrafficLog({ followActiveTab, preserve: isPreserved }),
  );
  useEffect(() => {
    log.start();
    return () => log.stop();
  }, [log]);
  const traffic = useSyncExternalStore(log.subscribe, log.snapshot);
  return { log, traffic };
}
