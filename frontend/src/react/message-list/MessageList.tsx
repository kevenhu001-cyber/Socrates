import { createRoot, type Root } from 'react-dom/client';
import { useLayoutEffect, useSyncExternalStore } from 'react';

import {
  getChatRuntimeSnapshot,
  subscribeToChatRuntime,
} from '../chatRuntime.bridge';
import { ErrorBoundary } from '../ErrorBoundary';
import { MessageItem } from './MessageItem';
import type { LegacyChatMessage } from '../types/domain';

const MSG_LIST_ID = 'msgList';

function isRenderable(entry: LegacyChatMessage): boolean {
  /* A streaming entry is renderable as soon as the stream starts: React owns
     the live turn (see react/tool-run/AssistantTurn's `live` mode), which is
     what the status line, the running tool row, and the arriving tail all
     paint from. `chat/toolRuntime.ts` keeps `toolCalls[]` current and main.js
     keeps `rawText` + `_liveStatus` current on this same object. */
  if (typeof entry.type === 'string' && entry.type === 'streaming') return true;
  if (typeof entry.html === 'string' && entry.html.length > 0) return true;
  if (typeof entry.rawText === 'string' && entry.rawText.length > 0) return true;
  return false;
}

function entryId(entry: LegacyChatMessage, fallback: string): string {
  if (typeof entry.clientId === 'string' && entry.clientId.length > 0) return entry.clientId;
  if (typeof entry.id === 'string' && entry.id.length > 0) return entry.id;
  return fallback;
}

let visibleMessagesCache: ReadonlyArray<LegacyChatMessage> = Object.freeze([]);
let visibleMessagesRevision = -1;

function getVisibleMessagesSnapshot(): ReadonlyArray<LegacyChatMessage> {
  const snapshot = getChatRuntimeSnapshot();
  /* The store's revision — not entry identity — is the invalidation signal.
     The legacy pipeline mutates message objects in place (streamed text,
     tool calls settling), so comparing entries would hand React back the
     same array after a publish and the bubble would freeze mid-stream.
     Returning a stable value while the revision is untouched is what
     `useSyncExternalStore` requires of a snapshot reader. */
  if (visibleMessagesRevision === snapshot.revision) return visibleMessagesCache;

  const seen = new Set<string>();
  const next: LegacyChatMessage[] = [];

  snapshot.messages.forEach((entry, idx) => {
    const id = entryId(entry, `idx-${idx}`);
    if (!isRenderable(entry) || seen.has(id)) return;
    seen.add(id);
    next.push(entry);
  });

  visibleMessagesRevision = snapshot.revision;
  visibleMessagesCache = Object.freeze(next);
  return visibleMessagesCache;
}

function MessageList() {
  const visibleMessages = useSyncExternalStore(
    subscribeToChatRuntime,
    getVisibleMessagesSnapshot,
    getVisibleMessagesSnapshot,
  );
  const items = visibleMessages;
  // Legacy addMessage schedules its scroll before React has committed the
  // new bubble. On a keyboard-constrained viewport that leaves the transcript
  // one bubble above the true bottom. Scroll after this list's DOM commit,
  // while still respecting a reader who deliberately scrolled away.
  //
  // Only scroll for a just-sent user message. Assistant entries (stream
  // finalization, history restore) never move the viewport: the page must
  // stay exactly where it is when an answer finishes.
  useLayoutEffect(() => {
    const w = window as unknown as {
      state?: { _userScrolledAway?: boolean };
    };
    if (w.state?._userScrolledAway) return;
    const list = document.getElementById(MSG_LIST_ID);
    if (!list) return;
    const last = items.length ? items[items.length - 1] : null;
    const lastRole = last && typeof last.role === 'string' ? last.role : '';
    if (lastRole === 'user') list.scrollTop = list.scrollHeight;
  }, [items.length, items.length ? entryId(items[items.length - 1], `idx-${items.length - 1}`) : null]);

  if (items.length === 0) {
    return <div data-react-message-list-empty="1" data-react-owned="1" />;
  }

  return (
    <>
      {items.map((entry, idx) => {
        const id = entryId(entry, `idx-${idx}`);
        return (
          <MessageItem
            key={id}
            message={entry}
            /* Both are read from mutable legacy state. Passing them as props
               is what lets the memoized row notice a change that left every
               object identity intact. */
            textLength={typeof entry.rawText === 'string' ? entry.rawText.length : 0}
            toolRevision={entry._toolRunRev || 0}
          />
        );
      })}
    </>
  );
}

/**
 * Mounts the React message list into the existing `#msgList` element.
 *
 * The host element keeps its id and its CSS classes. React only owns
 * its children — the legacy authoring paths (`addMessage`, session
 * history reload, branch context restore) detect the mounted runtime
 * via `dataset.reactMigrationRuntime === 'msg-list'` and skip their
 * direct DOM mutation. The legacy state push remains the authoritative
 * write; React renders from the chat runtime snapshot.
 *
 * A streaming bubble belongs to React too: the live turn renders from the
 * same `rawText` + `toolCalls` as a finalized one, with the chrome (status
 * line, running row) coming from `_liveStatus`. When the runtime is not
 * mounted, `main.js` keeps painting its own bubble — every legacy writer
 * checks the dataset flags this function sets before that hand-off.
 */
export function mountMessageList(): { root: Root | null } {
  const container = document.getElementById(MSG_LIST_ID);
  if (!container) return { root: null };
  /* main.js's `reactOwnsMsgList()` reads the same ownership flag. */
  if (container.dataset.mountedBy === 'msg-list') return { root: null };
  // The read-only share view renders #msgList itself; never mount over it.
  if (window.__socratesShareMsgListTakeover) return { root: null };

  const root = createRoot(container);
  root.render(<ErrorBoundary><MessageList /></ErrorBoundary>);
  container.dataset.mountedBy = 'msg-list';

  window.__socratesReleaseMsgListReact = () => {
    try { root.unmount(); } catch (_) { /* already unmounted */ }
    delete container.dataset.mountedBy;
    delete window.__socratesReleaseMsgListReact;
  };

  return { root };
}

export { MessageList };
export type { LegacyChatMessage };
