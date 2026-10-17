import type { LiveTurnStatus } from '../types/domain';
import type { TurnActivityEntry } from '@socrates/contracts';
import { useEffect, useId, useReducer, useState, type ReactNode } from 'react';
import { i18n } from '../legacy/gateway';

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
  children?: ReactNode;
  hasTools?: boolean;
}

export function TurnActivitySurface({ publicSummary = '', activities = [], isLive = false, elapsedSec, statusLabel, status, showActivityCue = true, intentSummary, children, hasTools = false }: TurnActivitySurfaceProps) {
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
  const timeline = activities.filter((entry) => entry.kind === 'reasoning_summary' && entry.text?.trim())
    .filter((entry, index, entries) => !entries.slice(index + 1).some((other) => other.text?.trim() === entry.text?.trim()))
    .slice(-5);
  const summaries = timeline.length ? timeline : normalizedSummary ? [{ id: 'public-summary', text: normalizedSummary, phase: 'done' }] : [];
  const hasDetails = Boolean(summaries.length || hasTools);
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
            {isLive && showActivityCue ? <span className="turn-activity-dot" aria-hidden="true" /> : null}
            <span className="thinking-accordion-title thinking-status-label" role={isLive ? 'status' : undefined}>
              {title}
            </span>
            {isLive && status?.elapsedSec ? <span className="thinking-status-detail">{status.elapsedSec}s</span> : null}
          </span>
          {hasDetails ? <span className="thinking-accordion-chev" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <path d="M4 6l4 4 4-4H4z" />
            </svg>
          </span> : null}
        </button>
      </div>
      <div id={bodyId} className="thinking-accordion-body" aria-hidden={!isOpen} inert={!isOpen}>
        <div className="thinking-accordion-inner">
          {intentSummary ? <p className="turn-activity-intent">{intentSummary}</p> : null}
          <ol className="turn-activity-list">
            {summaries.map((entry) => <li key={entry.id} data-activity-id={entry.id} data-phase={entry.phase}>
              <div className="thinking-accordion-text">{entry.text?.trim()}</div>
            </li>)}
          </ol>
          {children}
        </div>
      </div>
    </div>
  );
}

export default TurnActivitySurface;
