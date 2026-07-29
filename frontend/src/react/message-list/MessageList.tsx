import { createRoot, type Root } from 'react-dom/client';
import { useLayoutEffect, useSyncExternalStore } from 'react';

import {
  getChatRuntimeSnapshot,
  subscribeToChatRuntime,
} from '../chatRuntimeStore';
import { ErrorBoundary } from '../ErrorBoundary';
import { MessageItem } from './MessageItem';
import type { LegacyChatMessage } from '../types/domain';

const MSG_LIST_ID = 'msgList';

interface MessageListProps {
  omitEntryIds?: ReadonlySet<string>;
}

function isFinalized(entry: LegacyChatMessage): boolean {
  if (typeof entry.type === 'string' && entry.type === 'streaming') return false;
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

function getVisibleMessagesSnapshot(): ReadonlyArray<LegacyChatMessage> {
  const seen = new Set<string>();
  const next: LegacyChatMessage[] = [];

  getChatRuntimeSnapshot().messages.forEach((entry, idx) => {
    const id = entryId(entry, `idx-${idx}`);
    if (!isFinalized(entry) || seen.has(id)) return;
    seen.add(id);
    next.push(entry);
  });

  if (
    next.length === visibleMessagesCache.length
    && next.every((entry, index) => entry === visibleMessagesCache[index])
  ) {
    return visibleMessagesCache;
  }

  visibleMessagesCache = Object.freeze(next);
  return visibleMessagesCache;
}

function MessageList({ omitEntryIds }: MessageListProps) {
  const visibleMessages = useSyncExternalStore(
    subscribeToChatRuntime,
    getVisibleMessagesSnapshot,
    getVisibleMessagesSnapshot,
  );
  const items = omitEntryIds?.size
    ? visibleMessages.filter((entry, idx) => !omitEntryIds.has(entryId(entry, `idx-${idx}`)))
    : visibleMessages;

  // Legacy addMessage schedules its scroll before React has committed the
  // new bubble. On a keyboard-constrained viewport that leaves the transcript
  // one bubble above the true bottom. Scroll after this list's DOM commit,
  // while still respecting a reader who deliberately scrolled away.
  //
  // Special case: when the items.length jump is the legacy main.js finish()
  // path transitioning a streaming bubble to its finalized copy, the legacy
  // _hfTick in main.js (around line 6142) is the single source of truth for
  // "snap to bottom if pinned, else preserve distance-from-bottom". If this
  // effect also ran unconditionally, it would yank the reader to the top of
  // the freshly-committed bubble *before* _hfTick restores their anchor —
  // perceived as a spontaneous page refresh the moment the answer finishes.
  // The flag is set by main.js before publishing the stream-finished event
  // and cleared once _hfTick has run.
  useLayoutEffect(() => {
    const w = window as unknown as {
      __socratesStreamFinishing?: boolean;
      state?: { _userScrolledAway?: boolean };
    };
    if (w.__socratesStreamFinishing) {
      // Don't touch scrollTop — legacy _hfTick owns the post-commit anchor.
      // Do NOT clear the flag here: clearing belongs to legacy after _hfTick
      // has actually run, otherwise a second items.length change inside the
      // same frame would fall through to the unconditional branch.
      return;
    }
    if (w.state?._userScrolledAway) return;
    const list = document.getElementById(MSG_LIST_ID);
    if (!list) return;
    // P_no-finish-jump — force-scroll only when the reader just sent a
    // message. For assistant entries (stream finalization replay,
    // history restore, a flag leak from a failed handoff) only snap
    // when the reader is already near the bottom — the previous
    // unconditional snap is what yanked a reader who was partway
    // through a long answer to a new position the instant the entry
    // committed, perceived as a spontaneous page refresh.
    const last = items.length ? items[items.length - 1] : null;
    const lastRole = last && typeof last.role === 'string' ? last.role : '';
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight <= 96;
    if (lastRole === 'user' || nearBottom) list.scrollTop = list.scrollHeight;
  }, [items.length, items.length ? entryId(items[items.length - 1], `idx-${items.length - 1}`) : null]);

  if (items.length === 0) {
    return <div data-react-message-list-empty="1" data-react-owned="1" />;
  }

  return (
    <>
      {items.map((entry, idx) => {
        const id = entryId(entry, `idx-${idx}`);
        return <MessageItem key={id} message={entry} />;
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
 * Streaming bubbles (`type === 'streaming'`) stay owned by the
 * legacy streaming pipeline until they finish; React re-renders them
 * once their `html` is set. The `omitEntryIds` set suppresses React's
 * render for in-flight streams during the transition window.
 */
export function mountMessageList(): { root: Root | null } {
  const container = document.getElementById(MSG_LIST_ID);
  if (!container) return { root: null };
  if (container.dataset.msgListReactHydrated === '1') return { root: null };
  // The read-only share view renders #msgList itself; never mount over it.
  if (window.__socratesShareMsgListTakeover) return { root: null };

  container.dataset.msgListReactHydrated = '1';
  container.setAttribute('data-react-migration-runtime', 'msg-list');

  const root = createRoot(container);
  const omit = buildOmitSet();
  root.render(<ErrorBoundary><MessageList omitEntryIds={omit} /></ErrorBoundary>);

  window.__socratesReleaseMsgListReact = () => {
    try { root.unmount(); } catch (_) { /* already unmounted */ }
    delete container.dataset.msgListReactHydrated;
    container.removeAttribute('data-react-migration-runtime');
    delete window.__socratesReleaseMsgListReact;
  };

  return { root };
}

function buildOmitSet(): ReadonlySet<string> {
  try {
    const raw = window.__socratesActiveStreamIds;
    if (Array.isArray(raw)) {
      return new Set(raw.filter((s): s is string => typeof s === 'string'));
    }
  } catch (_) { /* no-op */ }
  return new Set<string>();
}

export { MessageList };
export type { LegacyChatMessage };
