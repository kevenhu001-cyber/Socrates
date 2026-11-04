import { getChatRuntimeSnapshot } from '../../ui/chatRuntimeStore.ts';
import type { LegacyChatMessage } from '../types/domain';
import { entryId } from './messageIdentity.ts';

function isRenderable(entry: LegacyChatMessage): boolean {
  if (entry.type === 'streaming') return true;
  if (typeof entry.html === 'string' && entry.html.length > 0) return true;
  if (typeof entry.rawText === 'string' && entry.rawText.length > 0) return true;
  if (Array.isArray(entry.toolCalls) && entry.toolCalls.length > 0) return true;
  if (entry.turnRuntime?.uiSurfaces.some((surface) => surface.phase === 'committed' && surface.nodes.length > 0)) return true;
  return Array.isArray(entry.attachments) && entry.attachments.length > 0;
}

export interface VisibleMessagesCache {
  source: ReadonlyArray<LegacyChatMessage>;
  visible: ReadonlyArray<LegacyChatMessage>;
  /** ids[i] = entryId of source[i] when renderable, else null. */
  ids: ReadonlyArray<string | null>;
  /** counts[i] = number of visible entries among source[0..i]. */
  counts: ReadonlyArray<number>;
}

function computeFull(messages: ReadonlyArray<LegacyChatMessage>): VisibleMessagesCache {
  const seen = new Set<string>();
  const next: LegacyChatMessage[] = [];
  const ids: (string | null)[] = new Array(messages.length);
  const counts: number[] = new Array(messages.length);
  messages.forEach((entry, index) => {
    const id = isRenderable(entry) ? entryId(entry, `idx-${index}`) : null;
    ids[index] = id;
    if (id === null || seen.has(id)) {
      counts[index] = next.length;
      return;
    }
    seen.add(id);
    next.push(entry);
    counts[index] = next.length;
  });
  return { source: messages, visible: Object.freeze(next), ids, counts };
}

/**
 * Incremental filter + dedupe over the canonical message array.
 *
 * reconcileMessageSnapshots reuses the previous message objects for unchanged
 * rows, so during a stream each commit produces a fresh array whose HEAD is
 * element-wise identical and only the tail differs. The identity walk finds
 * that split point; everything before it inherits its ids, renderability and
 * dedupe outcome verbatim, so the per-commit cost collapses from a full
 * filter + dedupe + entryId pass (audit R6) to a pointer walk plus O(tail)
 * real work. Mid-array mutations simply shorten the prefix; pure appends and
 * element-wise-identical arrays (a reconcile map with no row changed) keep
 * the previous visible list without rework.
 */
export function visibleFromMessages(
  messages: ReadonlyArray<LegacyChatMessage>,
  prev: VisibleMessagesCache | null,
): VisibleMessagesCache {
  if (!prev) return computeFull(messages);

  const shared = Math.min(prev.source.length, messages.length);
  let prefix = 0;
  while (prefix < shared && messages[prefix] === prev.source[prefix]) prefix++;

  if (prefix === messages.length && prefix === prev.source.length) {
    /* Same rows in the same order behind a new array reference. */
    return { source: messages, visible: prev.visible, ids: prev.ids, counts: prev.counts };
  }

  const ids: (string | null)[] = new Array(messages.length);
  const counts: number[] = new Array(messages.length);
  const next: LegacyChatMessage[] = [];
  const seen = new Set<string>();
  if (prefix > 0) {
    for (let i = 0; i < prefix; i++) {
      const id = prev.ids[i] ?? null;
      ids[i] = id;
      counts[i] = prev.counts[i];
      if (id !== null) seen.add(id);
    }
    const keep = prev.counts[prefix - 1];
    for (let i = 0; i < keep; i++) next.push(prev.visible[i]);
  }
  for (let i = prefix; i < messages.length; i++) {
    const entry = messages[i];
    const id = isRenderable(entry) ? entryId(entry, `idx-${i}`) : null;
    ids[i] = id;
    if (id === null || seen.has(id)) {
      counts[i] = next.length;
      continue;
    }
    seen.add(id);
    next.push(entry);
    counts[i] = next.length;
  }
  return { source: messages, visible: Object.freeze(next), ids, counts };
}

let cache: VisibleMessagesCache | null = null;

export function getVisibleMessagesSnapshot(): ReadonlyArray<LegacyChatMessage> {
  const messages = getChatRuntimeSnapshot().messages;
  if (cache?.source === messages) return cache.visible;
  cache = visibleFromMessages(messages, cache);
  return cache.visible;
}
