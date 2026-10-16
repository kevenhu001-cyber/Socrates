import { getChatRuntimeSnapshot } from '../chatRuntime.bridge';
import type { LegacyChatMessage } from '../types/domain';
import { entryId } from './messageIdentity';

function isRenderable(entry: LegacyChatMessage): boolean {
  if (entry.type === 'streaming') return true;
  if (typeof entry.html === 'string' && entry.html.length > 0) return true;
  if (typeof entry.rawText === 'string' && entry.rawText.length > 0) return true;
  if (Array.isArray(entry.toolCalls) && entry.toolCalls.length > 0) return true;
  if (entry.turnRuntime?.uiSurfaces.some((surface) => surface.phase === 'committed' && surface.nodes.length > 0)) return true;
  return Array.isArray(entry.attachments) && entry.attachments.length > 0;
}

let visibleMessagesCache: ReadonlyArray<LegacyChatMessage> = Object.freeze([]);
let visibleMessagesRevision = -1;

export function getVisibleMessagesSnapshot(): ReadonlyArray<LegacyChatMessage> {
  const snapshot = getChatRuntimeSnapshot();
  /* The list/filter result is revision-scoped. Individual message objects are
     immutable and keep stable identity when that row did not change. */
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
