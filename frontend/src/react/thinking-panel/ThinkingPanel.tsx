import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { openDetailSurface, closeDetailSurface } from '../../ui/detailSurface.ts';
import { translate } from './copy';
import { SummaryHistoryTurnView } from './SummaryHistoryTurnView';
import { getChatRuntimeSnapshot, subscribeToChatRuntime } from '../chatRuntime.bridge';
import type { LegacyChatMessage } from '../types/domain';
import {
  getThinkingPanelSnapshot,
  subscribeToThinkingPanel,
} from './thinkingPanel.bridge';
import { buildSummaryHistory } from './summaryHistory';

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
  const open = snapshot.open;
  const history = useMemo(
    () => open ? buildSummaryHistory(runtime.messages as ReadonlyArray<LegacyChatMessage>, snapshot) : [],
    [open, runtime.messages, snapshot],
  );

  useEffect(() => {
    const trigger = document.getElementById('summaryBtn');
    if (trigger) trigger.setAttribute('aria-expanded', String(open));
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    openDetailSurface({
      owner: 'thinking',
      title: translate('think.historyTitle', 'Summary history'),
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
      aria-label={translate('think.historyTitle', 'Summary history')}
      onScroll={() => {
        const body = bodyRef.current;
        if (!body) return;
        setPinned(body.scrollHeight - body.scrollTop - body.clientHeight <= 48);
      }}
    >
      {history.length ? (
        <ol className="thinking-history-list">
          {history.map((turn, index) => (
            <SummaryHistoryTurnView
              key={turn.id}
              turn={turn}
              number={index + 1}
              latest={index === history.length - 1}
            />
          ))}
        </ol>
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
