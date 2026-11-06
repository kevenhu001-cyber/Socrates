import { useLayoutEffect, useRef, type RefObject } from 'react';

import { getLegacyActions } from '../legacy/gateway.ts';
import type { LegacyChatMessage } from '../types/domain';
import { reportSwallow as reportEmptyCatch } from '../../util/reportSwallow.ts';
import { isOffscreenMount, runWhenNearViewport } from './nearViewport';

function runOptionalPostRender(action: (() => void) | undefined): void {
  try { action?.(); } catch (_) {
    reportEmptyCatch(_, 'empty catch: react/message-list/useMessagePostRender.ts:7', 'expected');
    /* optional legacy renderer unavailable */
  }
}

export function useMessagePostRender(
  message: LegacyChatMessage,
  html: string,
  clientId: string,
  isLive: boolean,
  bodyRef: RefObject<HTMLDivElement | null>,
): void {
  const firstWire = useRef(true);
  useLayoutEffect(() => {
    // Restored rows may contain canonical prose/tools without an HTML snapshot.
    // Their declarative body still needs chart, image, and tool-output wiring.
    if ((!html && !message.restoredFromHistory) || isLive || !clientId) return undefined;
    const root = bodyRef.current;
    if (!root) return undefined;
    /* A row the mount window placed outside the viewport (idle fill, a
       scroll shift, find's full mount) wires its heavy content only once it
       comes within reach; first-screen and live rows, and any later change
       to an already-mounted row, wire synchronously as before. */
    const deferrable = firstWire.current && isOffscreenMount();
    firstWire.current = false;
    if (deferrable) {
      const row = root.closest('.msg') ?? root;
      return runWhenNearViewport(row, () => {
        if (root.isConnected) wirePostRender(root, message, clientId);
      });
    }
    wirePostRender(root, message, clientId);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, clientId, isLive, message.restoredFromHistory]);
}

function wirePostRender(root: HTMLElement, message: LegacyChatMessage, clientId: string): void {
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
  if (message.restoredFromHistory) {
    runOptionalPostRender(() => {
      postRender.restorePersistedMessageExtras?.(
        root,
        message as unknown as Record<string, unknown>,
        `history-${clientId}`,
      );
    });
  }
}
