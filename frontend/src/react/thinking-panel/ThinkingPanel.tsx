import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { openDetailSurface, closeDetailSurface } from '../../ui/detailSurface.ts';
import { translate } from './copy';
import { SingleTurnSummaryView } from './SingleTurnSummaryView';
import { getChatRuntimeSnapshot, subscribeToChatRuntime } from '../chatRuntime.bridge';
import type { LegacyChatMessage } from '../types/domain';
import {
  getThinkingPanelSnapshot,
  subscribeToThinkingPanel,
} from './thinkingPanel.bridge';
import { buildSummaryHistory } from './summaryHistory';

function compactTab(text: string, limit: number): string {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length <= limit ? value : value.slice(0, limit - 1).trimEnd() + '…';
}

export function ThinkingPanel() {
  const snapshot = useSyncExternalStore(
    subscribeToThinkingPanel,
    getThinkingPanelSnapshot,
    getThinkingPanelSnapshot,
  );
  const runtime = useSyncExternalStore(
    subscribeToChatRuntime,
    getChatRuntimeSnapshot,
    getChatRuntimeSnapshot,
  );
  const content = useMemo(() => document.createElement('div'), []);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const [pinned, setPinned] = useState(true);
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);
  const open = snapshot.open;
  const history = useMemo(
    () => open ? buildSummaryHistory(runtime.messages as ReadonlyArray<LegacyChatMessage>, snapshot) : [],
    [open, runtime.messages, snapshot],
  );

  useEffect(() => {
    if (snapshot.messageId) {
      setSelectedTurnId(snapshot.messageId);
    } else if (history.length) {
      setSelectedTurnId(history[history.length - 1].id);
    }
  }, [snapshot.messageId, open, history]);

  const activeTurn = useMemo(() => {
    if (selectedTurnId) {
      const match = history.find((t) => t.id === selectedTurnId);
      if (match) return match;
    }
    return history.length ? history[history.length - 1] : null;
  }, [history, selectedTurnId]);

  useEffect(() => {
    const trigger = document.getElementById('summaryBtn');
    if (trigger) trigger.setAttribute('aria-expanded', String(open));
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    openDetailSurface({
      owner: 'thinking',
      title: translate('think.historyTitle', 'Summary'),
      closeLabel: translate('think.closePanel', 'Close summary'),
      content,
      onClose: () => window.__socratesThinkingPanelBridge?.publish({ type: 'panel-close' }),
    });
    return () => closeDetailSurface('thinking');
  }, [open, content]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !pinned) return;
    const reduce = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    body.scrollTo({ top: body.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  }, [history, pinned]);

  if (!open) return null;

  return createPortal(
    <div
      ref={bodyRef}
      className="thinking-summary-body"
      role="log"
      aria-live="polite"
      aria-label={translate('think.historyTitle', 'Summary')}
      onScroll={() => {
        const body = bodyRef.current;
        if (!body) return;
        setPinned(body.scrollHeight - body.scrollTop - body.clientHeight <= 48);
      }}
    >
      {history.length > 1 ? (
        <div className="thinking-turn-tabs" role="tablist" aria-label="Turn tabs">
          {history.map((turn, index) => {
            const isSelected = turn.id === activeTurn?.id;
            const label = turn.question ? compactTab(turn.question, 14) : `Turn ${index + 1}`;
            return (
              <button
                key={turn.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`thinking-turn-tab${isSelected ? ' is-active' : ''}`}
                onClick={() => setSelectedTurnId(turn.id)}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
      {activeTurn ? (
        <SingleTurnSummaryView turn={activeTurn} />
      ) : (
        <p className="thinking-panel-empty">
          {translate('think.historyEmpty', 'Summaries will appear after an answer is ready.')}
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
