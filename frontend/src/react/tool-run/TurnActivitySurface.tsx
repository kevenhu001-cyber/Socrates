import type { LiveTurnStatus } from '../types/domain';
import type { TurnActivityEntry } from '@socrates/contracts';
import { useEffect, useId, useReducer, useState, type ReactNode } from 'react';
import { i18n } from '../legacy/gateway';
import { STROKE_ICONS } from '../../ui/icons/toolIcons';
import { ToolActivityIcon } from './ToolActivityIcon';

export interface TurnActivitySurfaceProps {
  /** Public model-provided summary only. Never pass parsed reasoning text here. */
  publicSummary?: string;
  activities?: ReadonlyArray<TurnActivityEntry>;
  isLive?: boolean;
  elapsedSec?: number;
  statusLabel?: string;
  status?: LiveTurnStatus;
  showActivityCue?: boolean;
  intentSummary?: string;
  /** True once answer prose has started, even if the turn is still live. */
  answerStarted?: boolean;
  children?: ReactNode;
  hasTools?: boolean;
}

const SparkleActivityIcon = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" shapeRendering="geometricPrecision" className="thinking-accordion-icon">
    <path d="m12 3 1.9 4.8a2 2 0 0 0 1.3 1.3L20 11l-4.8 1.9a2 2 0 0 0-1.3 1.3L12 19l-1.9-4.8a2 2 0 0 0-1.3-1.3L4 11l4.8-1.9a2 2 0 0 0 1.3-1.3L12 3z" />
  </svg>
);

export function TurnActivitySurface({ publicSummary = '', activities = [], isLive = false, elapsedSec, statusLabel, status, showActivityCue = true, intentSummary, answerStarted = false, children, hasTools = false }: TurnActivitySurfaceProps) {
  const [isOpen, setIsOpen] = useState(false);
  const bodyId = useId();
  const [, refreshLanguage] = useReducer((revision: number) => revision + 1, 0);
  const normalizedSummary = publicSummary.trim();
  useEffect(() => {
    document.addEventListener('socrates:langchange', refreshLanguage);
    return () => {
      document.removeEventListener('socrates:langchange', refreshLanguage);
    };
  }, []);

  // Only explicitly public summaries enter the reasoning list. Tools share
  // this disclosure; interactive results and required actions stay outside.
  // Keep the last occurrence of each public summary. Work backwards so
  // streaming updates do not repeatedly scan the remainder of the timeline.
  const seenSummaries = new Set<string>();
  const timeline = activities.filter((entry) => entry.kind === 'reasoning_summary' && entry.text?.trim())
    .reverse()
    .filter((entry) => {
      const text = entry.text!.trim();
      if (seenSummaries.has(text)) return false;
      seenSummaries.add(text);
      return true;
    })
    .slice(0, 5)
    .reverse();
  const summaries = timeline.length ? timeline : normalizedSummary ? [{ id: 'public-summary', text: normalizedSummary, phase: 'done' }] : [];
  const hasDetails = Boolean(summaries.length || hasTools || intentSummary?.trim());
  if (!hasDetails && !isLive) return null;
  const title = isLive ? statusLabel || i18n('think.thinking', 'Thinking…')
    : typeof elapsedSec === 'number' && Number.isFinite(elapsedSec) && elapsedSec > 0
      ? i18n('think.thoughtDuration', 'Thought for {sec}s').replace('{sec}', String(Math.max(1, Math.round(elapsedSec))))
      : hasTools ? i18n('think.activity', 'Activity') : i18n('think.summary', 'Thought summary');

  return (
    <div
      className="turn-activity-surface thinking-accordion"
      data-turn-surface-part="activity"
      data-activity-timeline={timeline.length ? "true" : undefined}
      data-live={isLive && showActivityCue ? 'true' : undefined}
      data-answer-started={answerStarted ? 'true' : undefined}
      data-open={isOpen ? 'true' : 'false'}
    >
      <div className={`thinking-accordion-head${isLive ? ' thinking-status' : ''}`} data-phase={isLive ? status?.phase : undefined}>
        <button
          type="button"
          className="thinking-accordion-toggle"
          disabled={!hasDetails}
          aria-expanded={hasDetails ? isOpen : undefined}
          aria-controls={hasDetails ? bodyId : undefined}
          onClick={() => setIsOpen((previous) => !previous)}
        >
          <span className="thinking-accordion-left">
            {isLive && status?.toolName ? (
              <ToolActivityIcon name={status.toolName} />
            ) : !isLive && hasDetails && !hasTools ? (
              SparkleActivityIcon
            ) : null}
            <span className="thinking-accordion-title thinking-status-label" role={isLive ? 'status' : undefined}>
              {title}
            </span>
            {isLive && answerStarted ? (
              <span className="thinking-status-context">{i18n('think.answeringWhileWorking', 'Answering while activity continues')}</span>
            ) : null}
            {isLive && status?.elapsedSec ? <span className="thinking-status-detail">{status.elapsedSec}s</span> : null}
          </span>
          {hasDetails ? <span className="thinking-accordion-chev" aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: STROKE_ICONS.chevronDown }}
          /> : null}
        </button>
      </div>
      <div id={bodyId} className="thinking-accordion-body" aria-hidden={!isOpen} inert={!isOpen}>
        <div className="thinking-accordion-inner">
          <div className="turn-activity-content">
            {intentSummary ? <p className="turn-activity-intent">{intentSummary}</p> : null}
            <div className="turn-activity-list" role="list">
              {summaries.map((entry) => <div className="turn-activity-entry" role="listitem" key={entry.id} data-activity-id={entry.id} data-phase={entry.phase}>
                <div className="thinking-accordion-text">{entry.text?.trim()}</div>
              </div>)}
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TurnActivitySurface;
