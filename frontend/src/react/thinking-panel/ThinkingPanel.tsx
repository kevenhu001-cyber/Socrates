import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { openDetailSurface, closeDetailSurface } from '../../ui/detailSurface.ts';
import { STROKE_ICONS, toolIcon } from '../../ui/icons/toolIcons.js';

import {
  getThinkingPanelSnapshot,
  subscribeToThinkingPanel,
} from './thinkingPanel.bridge';
import type { ThinkingPanelActivity, ThinkingPanelSnapshot } from './types';

type TimelineRow =
  | { id: string; kind: 'summary' | 'thinking'; label: string }
  | (ThinkingPanelActivity & { kind: 'tool' });

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

function buildTimeline(snapshot: ThinkingPanelSnapshot): TimelineRow[] {
  const hasOpenActivity = snapshot.activities.some((activity) => (
    activity.state === 'running' || activity.state === 'awaiting'
  ));
  const hasActivity = snapshot.activities.length > 0;
  const rows: TimelineRow[] = [{
    id: 'summary-start',
    kind: 'summary',
    label: snapshot.streaming || hasActivity
      ? translate('think.summaryPreparing', 'Reviewing your question and preparing an answer.')
      : translate('think.summaryComplete', 'Response ready.'),
  }];
  for (const activity of snapshot.activities) {
    rows.push({ ...activity, kind: 'tool' });
  }
  if (hasActivity && !hasOpenActivity) {
    rows.push({
      id: 'summary-follow-up',
      kind: 'summary',
      label: snapshot.streaming
        ? translate('think.summaryReview', 'Reviewing the gathered information and preparing an answer.')
        : translate('think.summaryComplete', 'Response ready.'),
    });
  }
  if (snapshot.streaming && !hasOpenActivity) {
    rows.push({ id: 'thinking', kind: 'thinking', label: translate('common.thinkingLabel', 'Thinking') });
  }
  return rows;
}

function activityIcon(toolName: string): string {
  return toolName === 'web_search' ? STROKE_ICONS.fetch : toolIcon(toolName);
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
  const timeline = useMemo(() => buildTimeline(snapshot), [snapshot.activities, snapshot.streaming]);

  useLayoutEffect(() => {
    if (!open) return undefined;
    openDetailSurface({
      owner: 'thinking',
      title: translate('think.panelTitle', 'Summary'),
      closeLabel: translate('think.closePanel', 'Close summary'),
      content,
      onClose: () => window.__socratesThinkingPanelBridge?.publish({ type: 'panel-close' }),
    });
    return () => closeDetailSurface('thinking');
  }, [open, content]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !pinned) return;
    body.scrollTop = body.scrollHeight;
  }, [timeline, pinned]);

  if (!open) return null;

  return createPortal(
    <div
      ref={bodyRef}
      className="thinking-summary-body"
      role="log"
      aria-live="polite"
      aria-label={translate('think.panelTitle', 'Summary')}
      onScroll={() => {
        const body = bodyRef.current;
        if (!body) return;
        setPinned(body.scrollHeight - body.scrollTop - body.clientHeight <= 48);
      }}
    >
      <ol className="thinking-summary-timeline">
        {timeline.map((row) => {
          const icon = row.kind === 'tool' ? activityIcon(row.toolName) : '';
          return (
            <li
              key={row.id}
              className={`thinking-summary-item${row.kind === 'thinking' ? ' is-active' : row.kind === 'tool' ? ` is-${row.state}` : ''}`}
              data-kind={row.kind}
              data-state={row.kind === 'tool' ? row.state : undefined}
              aria-current={row.kind === 'thinking' ? 'step' : undefined}
            >
              <span className="thinking-summary-marker" aria-hidden="true">
                {icon ? <span className="thinking-summary-icon" dangerouslySetInnerHTML={{ __html: icon }} /> : null}
              </span>
              <span className="thinking-summary-label">{row.label}</span>
            </li>
          );
        })}
      </ol>
    </div>,
    content
  );
}

export function mountThinkingPanel(host: HTMLElement): () => void {
  const root = createRoot(host);
  root.render(<ThinkingPanel />);
  return () => root.unmount();
}
