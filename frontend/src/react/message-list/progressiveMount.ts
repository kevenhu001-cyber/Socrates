import type { LegacyChatMessage } from '../types/domain';
import { entryId } from './messageIdentity.ts';

export const INITIAL_ROWS = 12;
export const CHUNK_ROWS = 12;
export const MAX_MOUNTED_ROWS = 60;
export const NEAR_TOP_PX = 1200;
export const NEAR_BOTTOM_PX = 900;

export interface MountWindowState {
  floor: string | null;
  ceiling: string | null;
  full: boolean;
}

export interface MountTrack extends MountWindowState {
  items: ReadonlyArray<LegacyChatMessage>;
}

export interface ScrollAnchor {
  height: number;
  top: number;
  pinned: boolean;
  clientId?: string;
  visualTop?: number;
}

export type MountWindowDirection = 'older' | 'newer';

function lastId(items: ReadonlyArray<LegacyChatMessage>): string | null {
  return items.length ? entryId(items[items.length - 1], `idx-${items.length - 1}`) : null;
}

function isReplacement(
  previous: ReadonlyArray<LegacyChatMessage>,
  next: ReadonlyArray<LegacyChatMessage>,
): boolean {
  const previousLast = lastId(previous);
  if (previousLast === null) return true;
  /* The previous last row normally sits near the end after an append. */
  for (let index = next.length - 1; index >= 0; index--) {
    if (entryId(next[index], `idx-${index}`) === previousLast) return false;
  }
  return true;
}

export function indexOfId(items: ReadonlyArray<LegacyChatMessage>, id: string): number {
  for (let index = 0; index < items.length; index++) {
    if (entryId(items[index], `idx-${index}`) === id) return index;
  }
  return -1;
}

function stateFromRange(
  items: ReadonlyArray<LegacyChatMessage>,
  start: number,
  end: number,
): MountWindowState {
  return {
    floor: start > 0 ? entryId(items[start], `idx-${start}`) : null,
    ceiling: end < items.length ? entryId(items[end], `idx-${end}`) : null,
    full: false,
  };
}

function tailState(items: ReadonlyArray<LegacyChatMessage>): MountWindowState {
  const start = Math.max(0, items.length - INITIAL_ROWS);
  return stateFromRange(items, start, items.length);
}

function resolvedIndexes(
  items: ReadonlyArray<LegacyChatMessage>,
  state: MountWindowState,
): { start: number; end: number; valid: boolean } {
  if (state.full) return { start: 0, end: items.length, valid: true };
  const start = state.floor === null ? 0 : indexOfId(items, state.floor);
  const end = state.ceiling === null ? items.length : indexOfId(items, state.ceiling);
  return {
    start: Math.max(0, start),
    end: end < 0 ? items.length : end,
    valid: (state.floor === null || start >= 0)
      && (state.ceiling === null || end >= 0)
      && end >= start,
  };
}

export function resolveMountedRows(
  items: ReadonlyArray<LegacyChatMessage>,
  previous: MountTrack,
): {
  floor: string | null;
  ceiling: string | null;
  full: boolean;
  start: number;
  end: number;
  mounted: ReadonlyArray<LegacyChatMessage>;
  replaced: boolean;
} {
  const replaced = items !== previous.items && isReplacement(previous.items, items);
  let state: MountWindowState = replaced
    ? tailState(items)
    : { floor: previous.floor, ceiling: previous.ceiling, full: previous.full };
  let indexes = resolvedIndexes(items, state);

  if (!indexes.valid) {
    state = tailState(items);
    indexes = resolvedIndexes(items, state);
  }

  if (!state.full && indexes.end - indexes.start > MAX_MOUNTED_ROWS) {
    /* A tail-following window can grow as new turns append. Keep the newest
       MAX_MOUNTED_ROWS resident instead of letting a long-lived session grow
       its DOM without bound. Explicit historical windows keep their ceiling. */
    const end = indexes.end;
    const start = state.ceiling === null
      ? Math.max(0, end - MAX_MOUNTED_ROWS)
      : indexes.start;
    const cappedEnd = state.ceiling === null
      ? end
      : Math.min(end, start + MAX_MOUNTED_ROWS);
    state = stateFromRange(items, start, cappedEnd);
    indexes = { start, end: cappedEnd, valid: true };
  }

  const { start, end } = indexes;
  return {
    ...state,
    start,
    end,
    mounted: start === 0 && end === items.length ? items : items.slice(start, end),
    replaced,
  };
}

export function shiftMountWindow(
  items: ReadonlyArray<LegacyChatMessage>,
  current: MountTrack,
  direction: MountWindowDirection,
): MountWindowState {
  const resolved = resolveMountedRows(items, current);
  if (resolved.full || items.length <= MAX_MOUNTED_ROWS) {
    return { floor: resolved.floor, ceiling: resolved.ceiling, full: resolved.full };
  }

  const size = resolved.end - resolved.start;
  let start = resolved.start;
  let end = resolved.end;

  if (direction === 'older') {
    if (start <= 0) return stateFromRange(items, start, end);
    const nextStart = Math.max(0, start - CHUNK_ROWS);
    if (size < MAX_MOUNTED_ROWS) {
      start = nextStart;
    } else {
      start = nextStart;
      end = Math.min(items.length, start + MAX_MOUNTED_ROWS);
    }
  } else {
    if (end >= items.length) return stateFromRange(items, start, end);
    const nextEnd = Math.min(items.length, end + CHUNK_ROWS);
    if (size < MAX_MOUNTED_ROWS) {
      end = nextEnd;
    } else {
      end = nextEnd;
      start = Math.max(0, end - MAX_MOUNTED_ROWS);
    }
  }

  return stateFromRange(items, start, end);
}

export function fullMountWindow(): MountWindowState {
  return { floor: null, ceiling: null, full: true };
}

export function windowAroundIndex(
  items: ReadonlyArray<LegacyChatMessage>,
  index: number,
): MountWindowState {
  if (items.length <= MAX_MOUNTED_ROWS) return stateFromRange(items, 0, items.length);
  const clamped = Math.min(Math.max(0, index), items.length - 1);
  const half = Math.floor(MAX_MOUNTED_ROWS / 2);
  const start = Math.min(Math.max(0, clamped - half), items.length - MAX_MOUNTED_ROWS);
  return stateFromRange(items, start, start + MAX_MOUNTED_ROWS);
}
