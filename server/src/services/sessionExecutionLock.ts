import { waitForSignal } from '../lib/waitForSignal.js';

/**
 * In-process serializer for mutable session-scoped execution resources.
 *
 * Worker-pool slots protect a worker, while this lock protects the scratch
 * directory shared by all executions in one conversation. It intentionally
 * keeps no entry once the final waiter finishes.
 */
export function createSessionExecutionLock() {
  const tails = new Map<string, Promise<void>>();

  async function run<T>(
    sessionId: string | null,
    work: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    signal?.throwIfAborted();
    if (!sessionId) return work();

    const previous = tails.get(sessionId) || Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ownTail = previous.catch(() => undefined).then(() => gate);
    tails.set(sessionId, ownTail);

    let entered = false;
    const clear = () => {
      if (tails.get(sessionId) === ownTail) tails.delete(sessionId);
    };
    try {
      await waitForSignal(previous, signal);
      signal?.throwIfAborted();
      entered = true;
      return await work();
    } finally {
      release();
      if (entered) clear();
      else void ownTail.then(clear);
    }
  }

  return {
    run,
    /** Test/diagnostic aid. Never used for authorization decisions. */
    get pendingSessions() {
      return tails.size;
    },
    clear() {
      tails.clear();
    },
  };
}
