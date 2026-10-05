import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { openDetailSurface, closeDetailSurface, updateDetailSurface } from '../../ui/detailSurface.ts';

import {
  getThinkingPanelSnapshot,
  subscribeToThinkingPanel,
} from './thinkingPanel.bridge';
import { getLegacyActions } from '../legacy/gateway.ts';

function translate(key: string, fallback: string): string {
  try {
    const w = window as unknown as { t?: (k: string) => string };
    if (typeof w.t === 'function') {
      const value = w.t(key);
      if (typeof value === 'string' && value && value !== key) return value;
    }
  } catch (_) { /* ignore */ }
  return fallback;
}

function wordCountLabel(count: number): string {
  if (count === 1) {
    return translate('think.wordCountOne', '1 word');
  }
  return translate('think.wordCount', '{n} words').replace('{n}', String(count));
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* Render the reasoning trace with the same markdown pipeline as
   assistant bubbles (progressive while streaming, final when
   settled) instead of dumping raw markdown source. Memoized on the
   text value so a re-publish with identical text never re-parses.
   A renderer failure falls back to escaped plain text — the panel
   must never blank on a long trace. */
function useThinkingHtml(text: string, streaming: boolean): { __html: string } {
  return useMemo(() => {
    if (!text.trim()) return { __html: '' };
    try {
      const render = getLegacyActions().render;
      const paint = streaming && render.renderAssistantProgressive
        ? render.renderAssistantProgressive
        : render.renderAssistantHTML;
      return { __html: paint(text) };
    } catch (_) {
      return { __html: escapeHtml(text) };
    }
  }, [text, streaming]);
}

export function ThinkingPanel() {
  const snapshot = useSyncExternalStore(
    subscribeToThinkingPanel,
    getThinkingPanelSnapshot,
    getThinkingPanelSnapshot,
  );
  const content = useMemo(() => document.createElement('div'), []);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const [pinned, setPinned] = useState(true);
  const open = snapshot.open;
  const html = useThinkingHtml(snapshot.text, snapshot.streaming);

  useLayoutEffect(() => {
    if (!open) return undefined;
    openDetailSurface({
      owner: 'thinking',
      title: translate('think.panelTitle', 'Thought process'),
      closeLabel: translate('think.closePanel', 'Close thinking panel'),
      content,
      onClose: () => window.__socratesThinkingPanelBridge?.publish({ type: 'panel-close' }),
    });
    return () => closeDetailSurface('thinking');
  }, [open, content]);

  useEffect(() => {
    if (open) updateDetailSurface('thinking', wordCountLabel(snapshot.text.length));
  }, [open, snapshot.text.length]);

  /* Live auto-scroll: follow the reasoning text while streaming, but only
     when the user is already pinned to the bottom. */
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !snapshot.streaming || !pinned) return;
    body.scrollTop = body.scrollHeight;
  }, [snapshot.text, snapshot.streaming, pinned]);

  if (!open) return null;

  return createPortal(
    <div
      ref={bodyRef}
      className="thinking-panel-body"
      role="log"
      aria-live="polite"
      onScroll={() => {
        const body = bodyRef.current;
        if (!body) return;
        setPinned(body.scrollHeight - body.scrollTop - body.clientHeight <= 48);
      }}
    >
      {snapshot.text ? (
        <div className="thinking-panel-text is-rich" dangerouslySetInnerHTML={html} />
      ) : (
        <p className="thinking-panel-empty">
          {translate('think.panelEmpty', 'The model has not started thinking yet.')}
        </p>
      )}
    </div>,
    content
  );
}

export function mountThinkingPanel(host: HTMLElement): () => void {
  const root = createRoot(host);
  root.render(<ThinkingPanel />);
  return () => root.unmount();
}
