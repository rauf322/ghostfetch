// The time now, moving on every 15 s, so "Just now" becomes "A few minutes ago" without a new
// request coming in.
import { useEffect, useState } from 'react';

const EVERY = 15_000;

export function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), EVERY);
    return () => clearInterval(timer);
  }, []);
  return now;
}
