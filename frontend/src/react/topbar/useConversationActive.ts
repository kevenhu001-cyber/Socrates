import { useLayoutEffect } from 'react';
import { useKbStore, useSessionStore } from '../../store/index.ts';

/** Derive conversation chrome directly from the app's typed domain stores. */
export function useConversationActive(): boolean {
  const hasTopic = useSessionStore((snapshot) => Boolean(snapshot.topic));
  const phase = useSessionStore((snapshot) => snapshot.phase);
  const messageCount = useSessionStore((snapshot) => snapshot.messages.length);
  const knowledgeNodeCount = useKbStore((snapshot) => snapshot.kbNodes.length);
  const active = hasTopic || knowledgeNodeCount > 0 || phase === 'chat' || messageCount > 0;

  useLayoutEffect(() => {
    document.body.setAttribute('data-conversation-active', String(active));
  }, [active]);

  return active;
}
