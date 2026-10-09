import type { ToolRun } from '../toolRunState.js';

interface ProjectableToolEntry {
  id: string;
  textOffset?: number;
  _run?: ToolRun;
  _liveBuffer?: unknown;
  _pendingDeltas?: unknown;
  _pendingProgress?: unknown;
}

/** Copy JSON-shaped tool data without sharing mutable event/runtime objects. */
export function copyToolData<T>(value: T): T {
  if (Array.isArray(value)) return value.map(copyToolData) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyToolData(item)])) as T;
  }
  return value;
}

/** Queues and buffer handles belong to the runtime, never to session snapshots. */
const PRIVATE_ENTRY_SLOTS = ['_liveBuffer', '_pendingDeltas', '_pendingProgress'] as const;

/** One entry's cached projection plus what this runtime last committed for it. */
interface ProjectionRecord {
  snapshot: ProjectableToolEntry;
  /**
   * Shallow view of the DRAFT entry's visible values at projection time.
   * The projection is a deliberate deep copy, so comparing it against the
   * entry would never match — the change detector has to look at the entry's
   * own references, which the discipline in projectToolEntry keeps stable.
   */
  source: Record<string, unknown>;
  /** How many visible keys the source view covered. */
  keyCount: number;
  /** The object the store holds for this call after our last commit. */
  committed: ProjectableToolEntry;
  /** The draft entry's `_run` at projection time (non-enumerable). */
  run: ToolRun | undefined;
}

/** An entry's projection plus whether the previous one was reused. */
interface Projection {
  snapshot: ProjectableToolEntry;
  reused: boolean;
}

/**
 * Re-projecting every call on every animation frame made the commit cost scale
 * with the whole snapshot — measured ~1.6 ms for a 12-call turn with real
 * payloads, on top of a matching deep-freeze walk — even though at most a few
 * calls stream at a time. Reusing the last projection while an entry is
 * untouched makes the cost proportional to what changed, and reusing the
 * committed object itself lets the store's freeze memo skip the subtree.
 *
 * Safety: change detection is a shallow identity sweep, so an entry's
 * containers must be REPLACED, never mutated in place.
 */
const projections = new WeakMap<ProjectableToolEntry, ProjectionRecord>();

/** True when none of the entry's visible values moved since we projected it. */
function unchangedSinceProjection(record: ProjectionRecord, entry: ProjectableToolEntry): boolean {
  if (entry._run !== record.run) return false;
  const current = entry as unknown as Record<string, unknown>;
  let keys = 0;
  for (const key of Object.keys(entry)) {
    if ((PRIVATE_ENTRY_SLOTS as readonly string[]).includes(key)) continue;
    keys++;
    if (current[key] !== record.source[key]) return false;
  }
  /* A key added after the last projection must force a re-projection. */
  return keys === record.keyCount;
}

/** Project one entry, reusing the last projection while nothing on it moved. */
function projectToolEntry(entry: ProjectableToolEntry): Projection {
  const record = projections.get(entry);
  if (record && unchangedSinceProjection(record, entry)) {
    return { snapshot: record.snapshot, reused: true };
  }
  const { _liveBuffer, _pendingDeltas, _pendingProgress, ...visible } = entry;
  const snapshot = copyToolData(visible) as ProjectableToolEntry;
  if (entry._run) {
    Object.defineProperty(snapshot, '_run', {
      value: Object.freeze(copyToolData(entry._run)), enumerable: false,
    });
  }
  const source: Record<string, unknown> = {};
  let keyCount = 0;
  for (const key of Object.keys(entry)) {
    if ((PRIVATE_ENTRY_SLOTS as readonly string[]).includes(key)) continue;
    source[key] = (entry as unknown as Record<string, unknown>)[key];
    keyCount++;
  }
  if (record) {
    record.snapshot = snapshot;
    record.source = source;
    record.keyCount = keyCount;
    record.run = entry._run;
  } else {
    projections.set(entry, {
      snapshot, source, keyCount,
      committed: null as unknown as ProjectableToolEntry, run: entry._run,
    });
  }
  return { snapshot, reused: false };
}

/**
 * Overlay this runtime's entries onto what the store holds right now.
 *
 * `session/update-message` replaces the message object on every write, and
 * `finishRender`'s textOffset write-back is a second writer to `toolCalls`
 * that does NOT bump `_toolRunRev`. A plain `mine` list would therefore
 * publish a stale projection over it, and the split points that make the
 * inline layout survive a save/reload round-trip would silently vanish.
 *
 * Overlay semantics keep this runtime the owner of the tool lifecycle while
 * preserving fields another owner stamped after our last commit. Entries the
 * runtime has never seen are passed through untouched, so an external write
 * that adds a row is not dropped.
 *
 * A call whose projection is unchanged AND whose committed object the store
 * still holds is returned by identity: that is what lets the store's freeze
 * memo skip an entire subtree on every idle frame.
 */
export function mergeToolCalls<T extends ProjectableToolEntry>(base: T[] | undefined, mine: T[]): T[] {
  const projected = new Map<string, { entry: T; projection: Projection }>();
  for (const entry of mine) projected.set(String(entry.id), { entry, projection: projectToolEntry(entry) });
  if (!base || base.length === 0) {
    return [...projected.values()].map(({ entry, projection }) => {
      const record = projections.get(entry);
      if (record) record.committed = projection.snapshot;
      return projection.snapshot as T;
    });
  }
  const seen = new Set<string>();
  const merged: T[] = base.map((existing) => {
    const key = String(existing && existing.id);
    seen.add(key);
    const pair = projected.get(key);
    if (!pair) return existing;
    const record = projections.get(pair.entry);
    /* Identity reuse only when BOTH sides are untouched: our projection is
       the cached one, and the store still holds the object we committed. */
    if (pair.projection.reused && record && existing === record.committed) return existing;
    const next = { ...existing, ...pair.projection.snapshot } as T;
    // A split point another owner stamped on a call this runtime never
    // positioned survives: it is the only per-entry field written externally.
    if (pair.projection.snapshot.textOffset === undefined && existing.textOffset !== undefined) {
      next.textOffset = existing.textOffset;
    }
    if (pair.projection.snapshot._run) {
      Object.defineProperty(next, '_run', { value: pair.projection.snapshot._run, enumerable: false });
    }
    if (record) record.committed = next;
    return next;
  });
  for (const { entry, projection } of projected.values()) {
    if (seen.has(String(entry.id))) continue;
    const record = projections.get(entry);
    if (record) record.committed = projection.snapshot;
    merged.push(projection.snapshot as T);
  }
  return merged;
}
