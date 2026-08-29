/**
 * react/tool-run/useElapsed.ts — the ticking clock for in-flight tool runs.
 *
 * The old implementation kept a module-level RUNNING_INLINE_ROWS table in
 * ui/toolInline.ts and advanced every row's timer text from one shared
 * interval. Under React the same thing is a hook: the row that is running
 * subscribes to a 250ms tick and unsubscribes the moment it settles, so a
 * finished turn costs nothing.
 */
import { useEffect, useState } from 'react';

/**
 * Milliseconds elapsed since `startedAt`, re-computed on a tick while `active`.
 * Returns 0 when there is nothing to time — callers treat that as "show no
 * counter" rather than "show 0s".
 */
export function useElapsed(startedAt: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active || !startedAt) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [active, startedAt]);
  return active && startedAt ? Math.max(0, now - startedAt) : 0;
}

export default useElapsed;
