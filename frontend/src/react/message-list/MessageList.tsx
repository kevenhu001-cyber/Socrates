import { createRoot, type Root } from 'react-dom/client';
import { useSyncExternalStore } from 'react';

import { subscribeToChatRuntime } from '../chatRuntime.bridge';
import { ErrorBoundary } from '../ErrorBoundary';
import type { LegacyChatMessage } from '../types/domain';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { isMsgListMounted, setMsgListMounted } from '../../ui/msgListMount.ts';
import { entryId } from './messageIdentity';
import { MessageItem } from './MessageItem';
import { useProgressiveMessageMount } from './useProgressiveMessageMount';
import { getVisibleMessagesSnapshot } from './visibleMessages';

const MSG_LIST_ID = 'msgList';

function MessageList() {
  const visibleMessages = useSyncExternalStore(
    subscribeToChatRuntime,
    getVisibleMessagesSnapshot,
    getVisibleMessagesSnapshot,
  );
  const { mounted, start } = useProgressiveMessageMount(visibleMessages);

  if (mounted.length === 0) {
    return <div data-react-message-list-empty="1" data-react-owned="1" />;
  }

  return (
    <>
      {mounted.map((entry, index) => {
        const id = entryId(entry, `idx-${index + start}`);
        return (
          <MessageItem
            key={id}
            message={entry}
            /* Legacy writers mutate message objects in place; these scalar
               revisions tell the memoized row when its rendered data changed. */
            textLength={typeof entry.rawText === 'string' ? entry.rawText.length : 0}
            toolRevision={entry._toolRunRev || 0}
            mathRevision={typeof window === 'undefined' ? 0 : window.__socratesMathRenderRev || 0}
            renderRevision={entry._katexRenderedRev || entry._renderRev || 0}
          />
        );
      })}
    </>
  );
}

/** Mount React rows into the legacy #msgList host without replacing its shell. */
export function mountMessageList(): { root: Root | null } {
  const container = document.getElementById(MSG_LIST_ID);
  if (!container || isMsgListMounted()) return { root: null };
  // The read-only share view renders #msgList itself; never mount over it.
  if (window.__socratesShareMsgListTakeover) return { root: null };

  const root = createRoot(container);
  root.render(<ErrorBoundary><MessageList /></ErrorBoundary>);
  setMsgListMounted(true);

  window.__socratesReleaseMsgListReact = () => {
    try {
      root.unmount();
    } catch (error) {
      reportSwallow(error, 'MessageList.releaseMsgListReact.unmount');
    }
    setMsgListMounted(false);
    delete window.__socratesReleaseMsgListReact;
  };

  return { root };
}

export { MessageList };
export type { LegacyChatMessage };
