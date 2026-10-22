/** Bound optional work and propagate cancellation to cooperative transports.
 * In-flight SQL cannot be cancelled through this abstraction; callers must
 * check the signal before scheduling subsequent queries. */
export function withTimeBudget<T>(
  work: (signal: AbortSignal) => Promise<T>,
  options: { timeoutMs?: number; signal?: AbortSignal },
  fallback: () => T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      controller.abort(options.signal?.reason ?? new Error('Time budget exceeded'));
      try { resolve(fallback()); } catch (error) { reject(error); }
    };
    if (options.signal?.aborted) { cancel(); return; }
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.timeoutMs !== undefined) timer = setTimeout(cancel, Math.max(0, options.timeoutMs));
    // Observe late settlements too: cancelled work may ignore the signal.
    Promise.resolve().then(() => {
      if (controller.signal.aborted) return fallback();
      return work(controller.signal);
    }).then((value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    }, (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      controller.abort(error);
      reject(error);
    });
  });
}
