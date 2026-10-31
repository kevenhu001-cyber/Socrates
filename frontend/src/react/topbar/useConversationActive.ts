import { useEffect, useLayoutEffect } from 'react';
import { useKbStore, useSessionStore } from '../../store/index.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';

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

  useEffect(() => {
    void import('../../tutor/socraticMastery.ts')
      .then(({ syncSocraticMasteryUI }) => syncSocraticMasteryUI())
      .catch((error) => reportSwallow(error, 'react/topbar.syncSocraticMastery'));
  }, [active]);

  return active;
}
