/**
 * react/tool-run/useElapsed.ts — the ticking clock for in-flight tool runs.
 *
 * The hook keeps the React surface local to each row, but all live rows share
 * one module-level 250ms clock. Subscribers disappear as soon as a row
 * settles, so a finished turn costs nothing and a busy turn does not create a
 * timer per row.
 */
import { useEffect, useState } from 'react';

type ElapsedListener = () => void;

/* One clock for all live tool rows. A busy agent can render several rows at
   once; one interval keeps the browser's timer queue small and gives those
   rows the same timestamp instead of waking React once per row. */
const elapsedListeners = new Set<ElapsedListener>();
let elapsedTimer: ReturnType<typeof setInterval> | null = null;

function stopElapsedClock(): void {
  if (elapsedTimer === null) return;
  clearInterval(elapsedTimer);
  elapsedTimer = null;
}

function ensureElapsedClock(): void {
  if (elapsedTimer !== null) return;
  elapsedTimer = setInterval(() => {
    elapsedListeners.forEach((listener) => listener());
  }, 250);
}

function subscribeToElapsedClock(listener: ElapsedListener): () => void {
  elapsedListeners.add(listener);
  ensureElapsedClock();
  return () => {
    elapsedListeners.delete(listener);
    if (elapsedListeners.size === 0) stopElapsedClock();
  };
}

/**
 * Milliseconds elapsed since `startedAt`, re-computed on a tick while `active`.
 * Returns 0 when there is nothing to time — callers treat that as "show no
 * counter" rather than "show 0s".
 */
export function useElapsed(startedAt: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active || !startedAt) return undefined;
    setNow(Date.now());
    return subscribeToElapsedClock(() => setNow(Date.now()));
  }, [active, startedAt]);
  return active && startedAt ? Math.max(0, now - startedAt) : 0;
}

export default useElapsed;
