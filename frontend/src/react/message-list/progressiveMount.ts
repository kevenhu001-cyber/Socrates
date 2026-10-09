import type { LegacyChatMessage } from '../types/domain';
import { entryId } from './messageIdentity.ts';

export const INITIAL_ROWS = 12;
export const CHUNK_ROWS = 12;
export const NEAR_TOP_PX = 1200;

export interface MountTrack {
  items: ReadonlyArray<LegacyChatMessage>;
  floor: string | null;
}

export interface ScrollAnchor {
  height: number;
  top: number;
  pinned: boolean;
}

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

export function resolveMountedRows(
  items: ReadonlyArray<LegacyChatMessage>,
  previous: MountTrack,
): { floor: string | null; start: number; mounted: ReadonlyArray<LegacyChatMessage>; replaced: boolean } {
  let floor = previous.floor;
  const replaced = items !== previous.items && isReplacement(previous.items, items);
  if (replaced) {
    floor = items.length > INITIAL_ROWS
      ? entryId(items[items.length - INITIAL_ROWS], `idx-${items.length - INITIAL_ROWS}`)
      : null;
  }
  let start = 0;
  if (floor !== null) {
    start = indexOfId(items, floor);
    if (start <= 0) {
      start = 0;
      floor = null;
    }
  }
  return { floor, start, mounted: start > 0 ? items.slice(start) : items, replaced };
}
