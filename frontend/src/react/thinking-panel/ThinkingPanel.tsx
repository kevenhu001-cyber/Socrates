import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';

import {
  getThinkingPanelSnapshot,
  subscribeToThinkingPanel,
} from './thinkingPanel.bridge';
import { getLegacyActions } from '../legacy/gateway.js';

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
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<Element | null>(null);
  const [pinned, setPinned] = useState(true);
  const open = snapshot.open;
  const html = useThinkingHtml(snapshot.text, snapshot.streaming);

  /* Capture the trigger element when the panel opens and restore focus
     when it closes, so keyboard users land back where they started. */
  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement;
      closeRef.current?.focus();
    } else if (returnFocusRef.current && returnFocusRef.current.isConnected) {
      const target = returnFocusRef.current as HTMLElement;
      if (typeof target.focus === 'function') target.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        try {
          window.__socratesThinkingPanelBridge?.publish({ type: 'panel-close' });
        } catch (_) { /* ignore */ }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  /* Live auto-scroll: follow the reasoning text while streaming, but only
     when the user is already pinned to the bottom. */
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !snapshot.streaming || !pinned) return;
    body.scrollTop = body.scrollHeight;
  }, [snapshot.text, snapshot.streaming, pinned]);

  if (!open) return null;

  const close = () => {
    try {
      window.__socratesThinkingPanelBridge?.publish({ type: 'panel-close' });
    } catch (_) { /* ignore */ }
  };

  return (
    <>
      <div
        className="thinking-panel-backdrop"
        data-thinking-panel-backdrop="1"
        onClick={close}
        aria-hidden="true"
      />
      <aside
        className="thinking-panel"
        data-thinking-panel="1"
        role="dialog"
        aria-modal="true"
        aria-label={translate('think.panelTitle', 'Thought process')}
      >
        <header className="thinking-panel-head">
          <div className="thinking-panel-heading">
            <h2 className="thinking-panel-title">
              {translate('think.panelTitle', 'Thought process')}
            </h2>
            {snapshot.streaming ? (
              <span className="thinking-panel-live" aria-hidden="true" />
            ) : null}
          </div>
          <span className="thinking-panel-meta">
            {wordCountLabel(snapshot.text.length)}
          </span>
          <button
            ref={closeRef}
            type="button"
            className="thinking-panel-close"
            onClick={close}
            aria-label={translate('think.closePanel', 'Close thinking panel')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
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
        </div>
      </aside>
    </>
  );
}

export function mountThinkingPanel(host: HTMLElement): () => void {
  const root = createRoot(host);
  root.render(<ThinkingPanel />);
  return () => root.unmount();
}
