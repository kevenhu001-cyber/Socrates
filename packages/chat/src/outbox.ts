/* outbox — durable replay queue for message mutations that never
 * reached the server. Ports `frontend/src/session/mutationOutbox.js`
 * without touching localStorage (banned in packages/): persistence goes
 * through the injected async KeyValueStore, and the network calls go
 * through injected functions so tests never need fetch.
 *
 * Why explicit deletes instead of replaying the PATCH: `discardFollowing`
 * deletes *every* row after the edited turn. Replaying a prune queued
 * minutes ago would delete turns the user produced after reconnecting —
 * the exact data the queue exists to protect. So an edit queues two
 * halves: one idempotent `patch` for the rewritten text, one `delete`
 * per dropped row. Every op is individually idempotent, so replaying a
 * partially-succeeded batch is safe (a 404 means the row is already
 * gone, for either op type). */

import type { KeyValueStore } from '@socrates/platform';

export type OutboxOpType = 'patch' | 'delete';
export interface OutboxOp {
  sessionId: string | null;
  id: string;
  type: OutboxOpType;
  content?: string;
  queuedAt: number;
}

export const OUTBOX_STORAGE_KEY = 'socrates-msg-outbox-v1';
/* ~120 bytes per op: the cap is roughly 60 KB, and dropping the OLDEST
 * ops is the safe direction — the newest edit is the one the user
 * still believes in. */
export const OUTBOX_MAX_OPS = 500;

export interface OutboxDeps {
  storage: KeyValueStore;
  /** PATCH /api/messages/:id — rewrite the turn text (no refetch). */
  patchMessage(sessionId: string | null, id: string, content: string): Promise<unknown>;
  /** DELETE /api/messages/:id — remove one explicit row. */
  deleteMessage(sessionId: string | null, id: string): Promise<unknown>;
  /** Offline short-circuit; defaults to the navigator probe. */
  isOnline?(): boolean;
}

function isOp(value: unknown): value is OutboxOp {
  if (!value || typeof value !== 'object') return false;
  const op = value as Record<string, unknown>;
  return typeof op.id === 'string' && (op.type === 'patch' || op.type === 'delete');
}

export function createMessageOutbox(deps: OutboxDeps) {
  let draining = false;

  async function readQueue(): Promise<OutboxOp[]> {
    try {
      const raw = await deps.storage.get(OUTBOX_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isOp);
    } catch {
      /* Corrupt JSON or a throwing store — start clean rather than
       * wedging the edit path. Nothing here is worth a crash. */
      return [];
    }
  }

  async function writeQueue(ops: OutboxOp[]): Promise<void> {
    try {
      if (!ops.length) {
        await deps.storage.remove(OUTBOX_STORAGE_KEY);
        return;
      }
      await deps.storage.set(OUTBOX_STORAGE_KEY, JSON.stringify(ops.slice(-OUTBOX_MAX_OPS)));
    } catch {
      /* Quota-exceeded store. The edit still works locally; only the
       * replay guarantee is lost, and the caller already told the user
       * the change was saved locally. */
    }
  }

  /** Record one failed message mutation for later replay. Best-effort,
   * never throws. `content` is required for patches. */
  async function queueMessageOp(
    sessionId: string | null, id: string, type: OutboxOpType, content?: string,
  ): Promise<void> {
    if (!id || (type !== 'patch' && type !== 'delete')) return;
    if (type === 'patch' && typeof content !== 'string') return;
    const ops = await readQueue();
    ops.push({ sessionId: sessionId || null, id, type, ...(type === 'patch' ? { content } : {}), queuedAt: Date.now() });
    await writeQueue(ops);
  }

  /** Mutations still waiting to reach the server. */
  async function pendingOpCount(): Promise<number> {
    return (await readQueue()).length;
  }

  /** Replay every queued mutation, oldest first. Stops at the first op
   * that fails for a reason other than "already gone" and leaves the
   * rest queued; progress is persisted per op so an interrupted drain
   * never replays an accepted write. Concurrent calls collapse. */
  async function drainMessageOutbox(): Promise<number> {
    if (draining) return 0;
    try {
      if (deps.isOnline && !deps.isOnline()) return 0;
    } catch { return 0; }
    const ops = await readQueue();
    if (!ops.length) return 0;
    draining = true;
    let done = 0;
    try {
      for (let i = 0; i < ops.length; i++) {
        const op = ops[i];
        try {
          if (op.type === 'patch') {
            /* discardFollowing is deliberately NOT replayed here — the
             * stale rows are queued as explicit deletes above. */
            await deps.patchMessage(op.sessionId, op.id, op.content ?? '');
          } else {
            await deps.deleteMessage(op.sessionId, op.id);
          }
        } catch (error) {
          /* 404 means the row is already absent — for a delete that is
           * success, for a patch the session is gone server-side (where
           * re-creating the turn would be wrong). Drop it either way. */
          if (!error || (error as { status?: number }).status !== 404) break;
        }
        done = i + 1;
        await writeQueue(ops.slice(i + 1));
      }
      return done;
    } finally {
      draining = false;
    }
  }

  return { queueMessageOp, pendingOpCount, drainMessageOutbox, readQueueForTest: readQueue };
}

export type MessageOutbox = ReturnType<typeof createMessageOutbox>;
