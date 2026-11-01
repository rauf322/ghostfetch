// The time now, moving on every `every` ms, so "1 minute ago" becomes "2 minutes ago" without a
// new request coming in.
import { useEffect, useState } from 'react';

export function useNow(every = 15_000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
}
