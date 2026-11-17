// Both state APIs wake these subscribers once per commit, including batches.
const listeners = new Set<() => void>();
let notifyScheduled = false;

export function subscribeLegacyState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyLegacyListeners(): void {
  listeners.forEach((listener) => listener());
}

export function notifyLegacyListenersDeferred(): void {
  if (notifyScheduled) return;
  notifyScheduled = true;
  const flush = () => {
    notifyScheduled = false;
    notifyLegacyListeners();
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
  else if (typeof queueMicrotask === 'function') queueMicrotask(flush);
  else Promise.resolve().then(flush);
}
