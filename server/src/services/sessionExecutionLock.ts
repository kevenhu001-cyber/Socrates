/**
 * In-process serializer for mutable session-scoped execution resources.
 *
 * Worker-pool slots protect a worker, while this lock protects the scratch
 * directory shared by all executions in one conversation. It intentionally
 * keeps no entry once the final waiter finishes.
 */
export function createSessionExecutionLock() {
  const tails = new Map<string, Promise<void>>();

  async function run<T>(sessionId: string | null, work: () => Promise<T>): Promise<T> {
    if (!sessionId) return work();

    const previous = tails.get(sessionId) || Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const ownTail = previous.catch(() => undefined).then(() => gate);
    tails.set(sessionId, ownTail);

    await previous.catch(() => undefined);
    try {
      return await work();
    } finally {
      release();
      if (tails.get(sessionId) === ownTail) tails.delete(sessionId);
    }
  }

  return {
    run,
    /** Test/diagnostic aid. Never used for authorization decisions. */
    get pendingSessions() { return tails.size; },
    clear() { tails.clear(); },
  };
}
