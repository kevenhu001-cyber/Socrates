import { useLayoutEffect, type RefObject } from 'react';

import { getLegacyActions } from '../legacy/gateway.ts';
import type { LegacyChatMessage } from '../types/domain';

function runOptionalPostRender(action: (() => void) | undefined): void {
  try { action?.(); } catch (_) { /* optional legacy renderer unavailable */ }
}

export function useMessagePostRender(
  message: LegacyChatMessage,
  html: string,
  clientId: string,
  isLive: boolean,
  bodyRef: RefObject<HTMLDivElement | null>,
): void {
  useLayoutEffect(() => {
    if (!html || isLive || !clientId) return;
    const root = bodyRef.current;
    if (!root) return;
    const postRender = getLegacyActions().postRender;
    /* Reclaim rendered viz/mermaid cards BEFORE the pending queues drain:
       a placeholder adopted here must not also get a fresh handshake. */
    runOptionalPostRender(() => postRender.reclaimVizCards?.(root));
    runOptionalPostRender(() => {
      if (postRender.schedulePendingMermaid) postRender.schedulePendingMermaid();
      else postRender.processPendingMermaid?.();
    });
    runOptionalPostRender(() => postRender.processPendingViz?.(root));
    runOptionalPostRender(() => postRender.processPendingVizActions?.(root));
    runOptionalPostRender(() => postRender.wireCodeBlockHeaders?.(root));
    runOptionalPostRender(() => postRender.wireMsgBodyImages?.(root));
    if (message.restoredFromHistory) {
      runOptionalPostRender(() => {
        postRender.restorePersistedMessageExtras?.(
          root,
          message as unknown as Record<string, unknown>,
          `history-${clientId}`,
        );
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, clientId, isLive, message.restoredFromHistory]);
}
