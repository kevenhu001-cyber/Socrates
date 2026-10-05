type DeferredRowsFlusher = () => void;

let activeRegistration: { flush: DeferredRowsFlusher } | null = null;

/** Register the mounted transcript's synchronous deferred-row flush action. */
export function registerDeferredMessageRowsFlusher(flush: DeferredRowsFlusher): () => void {
  const registration = { flush };
  activeRegistration = registration;
  return () => {
    if (activeRegistration === registration) activeRegistration = null;
  };
}

/** Mount every deferred history row before code that searches the full DOM. */
export function flushDeferredMessageRows(): void {
  activeRegistration?.flush();
}
