/** A cancellable delay shared by transport backoff and reconnect loops. */
export function throwIfAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) {
    const error = new Error(String(signal.reason || 'Operation aborted'));
    error.name = 'AbortError';
    throw error;
  }
}

export function abortableDelay(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    try { throwIfAborted(signal); } catch (error) { reject(error); return; }
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      try { throwIfAborted(signal); } catch (error) { reject(error); }
    };
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
