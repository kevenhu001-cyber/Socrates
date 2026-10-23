import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { sessions, sessionPromptSnapshots } from '../../db/schema/index.js';
import { NotFound, ApiError } from '../../lib/errors.js';

export interface SessionPromptStore {
  /** Must check current session ownership, including when a snapshot exists. */
  readOwned(userId: string, sessionId: string): Promise<string | null>;
  /** Insert-if-absent, then return the winner (also across server processes). */
  insertOnce(userId: string, sessionId: string, prompt: string): Promise<string>;
}

/** Only initialization is coalesced in memory. Completed prompts live in the
 * DB, survive reload/restart, and are never served from a stale owner cache. */
export function createSessionPromptResolver(store: SessionPromptStore) {
  const initializing = new Map<string, Promise<string>>();
  return async (userId: string | undefined, sessionId: string | undefined, initialize: () => Promise<string>): Promise<string> => {
    // Auxiliary, sessionless completions are intentionally stateless.
    if (!sessionId || !userId) return initialize();
    const key = `${userId}:${sessionId}`;
    const pending = initializing.get(key);
    if (pending) return pending;
    const work = (async () => {
      const saved = await store.readOwned(userId, sessionId);
      if (saved !== null) return saved;
      return store.insertOnce(userId, sessionId, await initialize());
    })();
    initializing.set(key, work);
    try { return await work; }
    finally { if (initializing.get(key) === work) initializing.delete(key); }
  };
}

const databaseStore: SessionPromptStore = {
  async readOwned(userId, sessionId) {
    const [row] = await getDb().select({ prompt: sessionPromptSnapshots.systemPrompt })
      .from(sessions).leftJoin(sessionPromptSnapshots, and(
        eq(sessionPromptSnapshots.sessionId, sessions.id), eq(sessionPromptSnapshots.userId, userId),
      ))
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId))).limit(1);
    if (!row) throw new NotFound('Session not found');
    return row.prompt;
  },
  async insertOnce(userId, sessionId, systemPrompt) {
    // Lock just the persistence step, never hold a transaction across prompt
    // file reads, memory recall or model calls. A concurrent deletion/transfer
    // cannot attach a prompt to somebody else's session.
    return getDb().transaction(async (tx) => {
      const [owned] = await tx.select({ id: sessions.id }).from(sessions)
        .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId))).for('share');
      if (!owned) throw new NotFound('Session not found');
      await tx.insert(sessionPromptSnapshots).values({ sessionId, userId, systemPrompt }).onConflictDoNothing();
      const [winner] = await tx.select({ prompt: sessionPromptSnapshots.systemPrompt }).from(sessionPromptSnapshots)
        .where(and(eq(sessionPromptSnapshots.sessionId, sessionId), eq(sessionPromptSnapshots.userId, userId))).limit(1);
      if (!winner) throw new NotFound('Session prompt not found');
      return winner.prompt;
    });
  },
};

export const resolveSessionPrompt = createSessionPromptResolver(databaseStore);

/**
 * Resolve the frozen session prompt, falling back to assembling it for this
 * turn when the snapshot store is unavailable.
 *
 * The snapshot is an optimisation, not a correctness requirement: it exists so
 * later turns of a session reuse turn-1's system prefix. A missing migration
 * (the table does not exist yet) or a transient database error must therefore
 * degrade to per-turn assembly instead of failing the whole chat turn. The
 * degraded path re-reads the prompt files and memory on every turn, which is
 * slower but behaviourally equivalent.
 *
 * Ownership failures are NOT degradable: `readOwned` raises NotFound when the
 * session does not belong to the caller, and swallowing that would let a
 * caller use someone else's session id. ApiError subclasses therefore always
 * propagate; only infrastructure failures fall back.
 */
export async function resolveSessionPromptOrAssemble(
  userId: string | undefined,
  sessionId: string | undefined,
  assemble: () => Promise<string>,
): Promise<string> {
  return createDegradableResolver(resolveSessionPrompt)(userId, sessionId, assemble);
}

/** Testable seam: wraps any resolver with the degrade behaviour above. */
export function createDegradableResolver(
  resolve: (userId: string | undefined, sessionId: string | undefined, assemble: () => Promise<string>) => Promise<string>,
): (userId: string | undefined, sessionId: string | undefined, assemble: () => Promise<string>) => Promise<string> {
  return async (userId, sessionId, assemble) => {
    try {
      return await resolve(userId, sessionId, assemble);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      console.warn(
        '[session-prompt] snapshot store unavailable, assembling per turn:',
        (err as Error).message,
      );
      return assemble();
    }
  };
}
