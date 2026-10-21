import { useEffect, useState } from "react";

export const NOW_REFRESH_MS = 60_000;

export function useNow(intervalMs = NOW_REFRESH_MS): number {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      clearInterval(timer);
    };
  }, [intervalMs]);

  return now;
}
