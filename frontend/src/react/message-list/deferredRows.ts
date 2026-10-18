type DeferredRowsAction = () => void;

let activeRegistration: { flush: DeferredRowsAction; restore?: DeferredRowsAction } | null = null;

/** Register the mounted transcript's synchronous full-mount escape hatch. */
export function registerDeferredMessageRowsFlusher(
  flush: DeferredRowsAction,
  restore?: DeferredRowsAction,
): () => void {
  const registration = { flush, restore };
  activeRegistration = registration;
  return () => {
    if (activeRegistration === registration) activeRegistration = null;
  };
}

/** Temporarily mount every history row before code that requires the full DOM. */
export function flushDeferredMessageRows(): void {
  activeRegistration?.flush();
}

/** Return a temporary full mount to the bounded history window. */
export function restoreDeferredMessageRows(): void {
  activeRegistration?.restore?.();
}
