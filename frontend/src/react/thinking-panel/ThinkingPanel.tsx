import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { openDetailSurface, closeDetailSurface } from '../../ui/detailSurface.ts';
import { STROKE_ICONS, toolIcon } from '../../ui/icons/toolIcons.js';
import { getChatRuntimeSnapshot, subscribeToChatRuntime } from '../chatRuntime.bridge';
import type { LegacyChatMessage } from '../types/domain';
import {
  getThinkingPanelSnapshot,
  subscribeToThinkingPanel,
} from './thinkingPanel.bridge';
import type { ThinkingPanelActivity } from './types';
import { buildSummaryHistory, type SummaryHistoryTurn } from './summaryHistory';

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

function activityIcon(toolName: string): string {
  return toolName === 'web_search' ? STROKE_ICONS.fetch : toolIcon(toolName);
}

function SummaryHistoryTurnView({
  turn,
  number,
  latest,
}: {
  turn: SummaryHistoryTurn;
  number: number;
  latest: boolean;
}) {
  const [expanded, setExpanded] = useState(latest || turn.streaming);
  const hasOpenActivity = turn.activities.some((activity) => (
    activity.state === 'running' || activity.state === 'awaiting'
  ));
  const showThinking = turn.streaming && !hasOpenActivity;
  const title = turn.question || translate('think.historyTurn', 'Turn {n}').replace('{n}', String(number));

  useEffect(() => {
    if (turn.streaming) setExpanded(true);
  }, [turn.streaming]);

  return (
    <li className={`thinking-history-turn${turn.streaming ? ' is-streaming' : ''}${expanded ? ' is-expanded' : ''}`} data-message-id={turn.id}>
      <button
        type="button"
        className="thinking-history-trigger"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="thinking-history-heading">
          <span className="thinking-history-question">{title}</span>
          <span className="thinking-history-state">
            {turn.streaming
              ? translate('think.historyWorking', 'Working on this answer')
              : translate('think.summaryComplete', 'Response ready.')}
          </span>
        </span>
        <span
          className="thinking-history-chevron"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: STROKE_ICONS.chevronDown }}
        />
      </button>
      {expanded ? (
        <div className="thinking-history-detail">
          {turn.answerPreview ? <p className="thinking-history-answer">{turn.answerPreview}</p> : null}
          {turn.activities.length || showThinking ? (
            <ol className="thinking-summary-timeline">
              {turn.activities.map((activity: ThinkingPanelActivity) => {
                const active = activity.state === 'running' || activity.state === 'awaiting';
                const icon = activityIcon(activity.toolName);
                return (
                  <li
                    key={activity.id}
                    className={`thinking-summary-item${active ? ' is-active' : ` is-${activity.state}`}`}
                    data-kind="tool"
                    data-state={activity.state}
                  >
                    <span className="thinking-summary-marker" aria-hidden="true">
                      {icon ? <span className="thinking-summary-icon" dangerouslySetInnerHTML={{ __html: icon }} /> : null}
                    </span>
                    <span className={`thinking-summary-label${active ? ' shimmer-text' : ''}`}>
                      {activity.label}
                    </span>
                  </li>
                );
              })}
              {showThinking ? (
                <li className="thinking-summary-item is-active" data-kind="thinking" aria-current="step">
                  <span className="thinking-summary-marker" aria-hidden="true"><span className="thinking-spinner" /></span>
                  <span className="thinking-summary-label shimmer-text">
                    {translate('common.thinkingLabel', 'Thinking')}
                  </span>
                </li>
              ) : null}
            </ol>
          ) : null}
        </div>
      ) : null}
    </li>
  );
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
