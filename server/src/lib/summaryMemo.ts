/** Bounded process-local cache of successful summaries. Callers hash the
 * owner/session/provider and source. Concurrent retries share one operation. */
export function createSummaryMemo(options: { maxEntries?: number; ttlMs?: number; now?: () => number } = {}) {
  const maxEntries = options.maxEntries ?? 8;
  const ttlMs = options.ttlMs ?? 10 * 60 * 1000;
  const now = options.now ?? Date.now;
  const saved = new Map<string, { value: string; at: number }>();
  const pending = new Map<string, Promise<string>>();
  return {
    async get(key: string, produce: () => Promise<string>): Promise<string> {
      const hit = saved.get(key);
      if (hit && now() - hit.at < ttlMs) {
        saved.delete(key);
        saved.set(key, hit); // LRU access never extends the retention TTL.
        return hit.value;
      }
      saved.delete(key);
      const active = pending.get(key);
      if (active) return active;
      // Bound in-flight bookkeeping. Upstream scheduling owns admission.
      if (pending.size >= maxEntries) return produce();
      const work = Promise.resolve().then(produce);
      pending.set(key, work);
      try {
        const value = await work;
        if (value.trim()) {
          saved.set(key, { value, at: now() });
          while (saved.size > maxEntries) saved.delete(saved.keys().next().value!);
        }
        return value;
      } finally {
        if (pending.get(key) === work) pending.delete(key);
      }
    },
    clear() { saved.clear(); },
  };
}
