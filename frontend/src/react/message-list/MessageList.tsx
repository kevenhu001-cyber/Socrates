import type { Root } from 'react-dom/client';
import { createRootSlot } from '../lib/boot/ownedRoot';
import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react';

import { subscribeToChatRuntime } from '../../ui/chatRuntimeStore';
import { ErrorBoundary } from '../ErrorBoundary';
import type { LegacyChatMessage } from '../types/domain';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { claimReactMessageList, isMsgListMounted, isSharedMessageList, registerSharedMessageListRestorer, takeOverSharedMessageList } from '../../ui/msgListMount.ts';
import { entryId } from './messageIdentity';
import { updateScrollFadeMask } from './messageScroll';
import { useProgressiveMessageMount } from './useProgressiveMessageMount';
import { getVisibleMessagesSnapshot } from './visibleMessages';
import { getMathRenderRevision } from '../../render/mathRevision.ts';
import { getHistoryPagingSnapshot, subscribeHistoryPaging, type HistoryPagingSnapshot } from '../../session/historyPagingState.ts';
import { i18n } from '../legacy/gateway';

/* RN-13 — the row renderer (toolbar, attachments, edit form, tool-run models,
   assistant turn boundary) is only needed once a transcript has messages, so
   it is not part of the entry closure. Mounting the list starts the fetch
   right away, in parallel with auth and session loading, so a restored
   conversation normally finds it ready. */
let itemModule: Promise<typeof import('./MessageItem')> | null = null;

function preloadMessageItem(): Promise<typeof import('./MessageItem')> {
  itemModule ??= import('./MessageItem').catch((error: unknown) => {
    itemModule = null;
    throw error;
  });
  return itemModule;
}

const MessageItem = lazy(() => preloadMessageItem().then(({ MessageItem: Item }) => ({ default: Item })));

function warmMessageItem(): void {
  preloadMessageItem().catch((error: unknown) => reportSwallow(error, 'MessageList.preload'));
}

const MSG_LIST_ID = 'msgList';

/* R7 phase 2 — status row above the oldest loaded message of a paginated
   transcript. It is present for the whole walk (not only while a page is in
   flight) so its height never appears or disappears above the reader:
   #msgList disables native scroll anchoring. Text only, no animated dots. */
function historyStatusText(paging: HistoryPagingSnapshot): string {
  if (paging.failed) return i18n('chat.history.loadFailed', 'Couldn’t load earlier messages. Scroll up to try again.');
  if (paging.hasMore) return paging.loading ? i18n('chat.history.loadingEarlier', 'Loading earlier messages') : '';
  return i18n('chat.history.start', 'Beginning of conversation');
}

function HistoryPageStatus({ paging }: { paging: HistoryPagingSnapshot }) {
  const text = historyStatusText(paging);
  return (
    <div
      className="history-page-status"
      role="status"
      aria-live="polite"
      aria-busy={paging.loading ? 'true' : undefined}
      data-history-loading={paging.loading ? 'true' : undefined}
      data-history-start={!paging.hasMore && !paging.failed ? 'true' : undefined}
    >
      {text}
    </div>
  );
}

function showsHistoryStatus(paging: HistoryPagingSnapshot, start: number, readOnly: boolean): boolean {
  return !readOnly && start === 0 && (paging.hasMore || paging.pagedBack);
}

function MessageList({ readOnly = false }: { readOnly?: boolean }) {
  const visibleMessages = useSyncExternalStore(
    subscribeToChatRuntime,
    getVisibleMessagesSnapshot,
    getVisibleMessagesSnapshot,
  );
  const { mounted, start } = useProgressiveMessageMount(visibleMessages);
  const paging = useSyncExternalStore(subscribeHistoryPaging, getHistoryPagingSnapshot, getHistoryPagingSnapshot);

  useEffect(() => {
    const list = document.getElementById(MSG_LIST_ID);
    if (!list) return undefined;
    const onScroll = () => updateScrollFadeMask(list);
    onScroll();
    list.addEventListener('scroll', onScroll, { passive: true });
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(onScroll);
      ro.observe(list);
    }
    return () => {
      list.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    };
  }, []);

  if (mounted.length === 0) {
    return <div data-react-message-list-empty="1" data-react-owned="1" />;
  }

  const latestByRole = new Map<string, LegacyChatMessage>();
  for (const entry of visibleMessages) latestByRole.set(entry.role || 'assistant', entry);

  return (
    <Suspense fallback={null}>
      {showsHistoryStatus(paging, start, readOnly) ? <HistoryPageStatus paging={paging} /> : null}
      {mounted.map((entry, index) => {
        const id = entryId(entry, `idx-${index + start}`);
        const isLatest = index + start === visibleMessages.length - 1;
        return (
          <MessageItem
            key={id}
            message={entry}
            isLatest={isLatest}
            isLatestOfRole={latestByRole.get(entry.role || 'assistant') === entry}
            readOnly={readOnly}
            mathRevision={getMathRenderRevision()}
          />
        );
      })}
    </Suspense>
  );
}

const rootSlot = createRootSlot('msg-list');
const sharedRootSlot = createRootSlot('shared-msg-list');

/** Mount React rows without replacing the transcript shell or a shared view. */
export function mountMessageList(): { root: Root | null } {
  const container = document.getElementById(MSG_LIST_ID);
  if (!container) { rootSlot.destroy(); return { root: null }; }
  if (isMsgListMounted() || isSharedMessageList(container)) return { root: null };
  warmMessageItem();
  const handle = rootSlot.mount(container, <ErrorBoundary><MessageList /></ErrorBoundary>, () =>
    claimReactMessageList(container, releaseMessageList));
  return { root: handle.root };
}

/** React owns public shared transcripts too; their rows omit live actions. */
export function mountSharedMessageList(): { root: Root | null } {
  const container = document.getElementById(MSG_LIST_ID);
  if (!container) { sharedRootSlot.destroy(); return { root: null }; }
  takeOverSharedMessageList(container);
  if (!isSharedMessageList(container)) return { root: null };
  warmMessageItem();
  const handle = sharedRootSlot.mount(container, <ErrorBoundary><MessageList readOnly /></ErrorBoundary>);
  return { root: handle.root };
}

registerSharedMessageListRestorer((host) => {
  if (document.getElementById(MSG_LIST_ID) !== host) return;
  sharedRootSlot.destroy();
  mountMessageList();
});

function releaseMessageList(): void {
  try { rootSlot.destroy(); }
  catch (error) { reportSwallow(error, 'MessageList.release'); }
}

export { MessageList };
export type { LegacyChatMessage };
