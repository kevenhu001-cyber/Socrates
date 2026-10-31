import type { Root } from 'react-dom/client';
import { createRootSlot } from '../lib/boot/ownedRoot';
import { useEffect, useSyncExternalStore } from 'react';

import { subscribeToChatRuntime } from '../../ui/chatRuntimeStore';
import { ErrorBoundary } from '../ErrorBoundary';
import type { LegacyChatMessage } from '../types/domain';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { claimReactMessageList, isMsgListMounted, isSharedMessageList, registerSharedMessageListRestorer, takeOverSharedMessageList } from '../../ui/msgListMount.ts';
import { entryId } from './messageIdentity';
import { MessageItem } from './MessageItem';
import { updateScrollFadeMask } from './messageScroll';
import { useProgressiveMessageMount } from './useProgressiveMessageMount';
import { getVisibleMessagesSnapshot } from './visibleMessages';
import { getMathRenderRevision } from '../../render/mathRevision.ts';

const MSG_LIST_ID = 'msgList';

function MessageList({ readOnly = false }: { readOnly?: boolean }) {
  const visibleMessages = useSyncExternalStore(
    subscribeToChatRuntime,
    getVisibleMessagesSnapshot,
    getVisibleMessagesSnapshot,
  );
  const { mounted, start } = useProgressiveMessageMount(visibleMessages);

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

  return (
    <>
      {mounted.map((entry, index) => {
        const id = entryId(entry, `idx-${index + start}`);
        const isLatest = index + start === visibleMessages.length - 1;
        return (
          <MessageItem
            key={id}
            message={entry}
            isLatest={isLatest}
            readOnly={readOnly}
            mathRevision={getMathRenderRevision()}
          />
        );
      })}
    </>
  );
}

const rootSlot = createRootSlot('msg-list');
const sharedRootSlot = createRootSlot('shared-msg-list');

/** Mount React rows without replacing the transcript shell or a shared view. */
export function mountMessageList(): { root: Root | null } {
  const container = document.getElementById(MSG_LIST_ID);
  if (!container) { rootSlot.destroy(); return { root: null }; }
  if (isMsgListMounted() || isSharedMessageList(container)) return { root: null };
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
