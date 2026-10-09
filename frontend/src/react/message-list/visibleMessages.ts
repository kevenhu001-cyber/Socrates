import { getChatRuntimeSnapshot } from '../chatRuntime.bridge';
import type { LegacyChatMessage } from '../types/domain';
import { entryId } from './messageIdentity';

function isRenderable(entry: LegacyChatMessage): boolean {
  if (entry.type === 'streaming') return true;
  if (typeof entry.html === 'string' && entry.html.length > 0) return true;
  return typeof entry.rawText === 'string' && entry.rawText.length > 0;
}

let visibleMessagesCache: ReadonlyArray<LegacyChatMessage> = Object.freeze([]);
let visibleMessagesRevision = -1;

export function getVisibleMessagesSnapshot(): ReadonlyArray<LegacyChatMessage> {
  const snapshot = getChatRuntimeSnapshot();
  /* Revisions invalidate the cache because the legacy pipeline mutates entries
     in place while streaming text and tool state. */
  if (visibleMessagesRevision === snapshot.revision) return visibleMessagesCache;

  const seen = new Set<string>();
  const next: LegacyChatMessage[] = [];
  snapshot.messages.forEach((entry, index) => {
    const id = entryId(entry, `idx-${index}`);
    if (!isRenderable(entry) || seen.has(id)) return;
    seen.add(id);
    next.push(entry);
  });

  visibleMessagesRevision = snapshot.revision;
  visibleMessagesCache = Object.freeze(next);
  return visibleMessagesCache;
}
