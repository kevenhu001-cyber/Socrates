/** Let the transcript commit and paint before account/session-local maintenance.
 * The load's abort signal owns both scheduling and cancellation. */
export function afterSessionPaint(signal: AbortSignal, isCurrent: () => boolean, work: () => void): void {
  if (signal.aborted) return;
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (frame) cancelAnimationFrame(frame);
    if (timer !== null) clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  };
  signal.addEventListener('abort', cancel, { once: true });
  frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      frame = 0;
      timer = setTimeout(() => {
        timer = null;
        signal.removeEventListener('abort', cancel);
        if (!signal.aborted && isCurrent()) work();
      }, 0);
    });
  });
}

/** Run `work` on idle, falling back to a short timeout. */
export function whenSessionIdle(work: () => void, timeout: number, signal?: AbortSignal): void {
  if (signal?.aborted) return;
  const usesIdle = typeof requestIdleCallback === 'function';
  const cancel = () => {
    if (usesIdle) cancelIdleCallback(handle as number);
    else clearTimeout(handle);
    signal?.removeEventListener('abort', cancel);
  };
  const run = () => {
    signal?.removeEventListener('abort', cancel);
    if (!signal?.aborted) work();
  };
  const handle = usesIdle ? requestIdleCallback(run, { timeout }) : setTimeout(run, 100);
  signal?.addEventListener('abort', cancel, { once: true });
}
