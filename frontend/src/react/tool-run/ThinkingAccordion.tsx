import type { TurnActivityEntry } from '@socrates/contracts';
import { toolRunLabel } from '../../ui/toolPresentationModel';
import { useEffect, useId, useReducer, useState } from 'react';
import { i18n } from '../legacy/gateway';

export interface ThinkingAccordionProps {
  /** Public model-provided summary only. Never pass parsed reasoning text here. */
  publicSummary?: string;
  activities?: ReadonlyArray<TurnActivityEntry>;
  isLive?: boolean;
  elapsedSec?: number;
}

function activityTitle(entry: TurnActivityEntry): string {
  if (entry.kind === 'reasoning_summary') return entry.text || '';
  if (entry.kind === 'tool') return toolRunLabel({ name: entry.toolName }, entry.phase === 'done' ? 'done' : entry.phase === 'failed' ? 'error' : entry.phase === 'stopped' ? 'stopped' : 'running').text;
  return entry.kind === 'synthesis' ? i18n('think.synthesizing', 'Preparing the answer') : i18n('think.thinking', 'Thinking…');
}

export function ThinkingAccordion({ publicSummary = '', activities = [], isLive = false, elapsedSec }: ThinkingAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const bodyId = useId();
  const [, refreshLanguage] = useReducer((revision: number) => revision + 1, 0);
  const normalizedSummary = publicSummary.trim();
  const displaySummary = normalizedSummary || (isLive
    ? i18n('think.summaryPreparing', 'Reviewing your question and preparing an answer.')
    : i18n('think.summaryComplete', 'Response ready.'));

  useEffect(() => {
    document.addEventListener('socrates:langchange', refreshLanguage);
    return () => {
      document.removeEventListener('socrates:langchange', refreshLanguage);
    };
  }, []);

  const timeline = activities.filter((entry) => entry.kind !== 'waiting');
  if (!normalizedSummary && !isLive && !timeline.length) return null;

  return (
    <div
      className="thinking-accordion"
      data-activity-timeline={timeline.length ? "true" : undefined}
      data-live={isLive ? 'true' : undefined}
      data-open={isOpen ? 'true' : 'false'}
    >
      <div className="thinking-accordion-head">
        <button
          type="button"
          className="thinking-accordion-toggle"
          aria-expanded={isOpen}
          aria-controls={bodyId}
          onClick={() => setIsOpen((previous) => !previous)}
        >
          <span className="thinking-accordion-left">
            <span className="thinking-dot-indicator" aria-hidden="true" hidden={timeline.length > 0}>
              <span className="thinking-dot-pulse">
                <span />
                <span />
                <span />
              </span>
              <span className="thinking-dot-calm" />
            </span>
            <span className="thinking-accordion-title">
              {timeline.length ? i18n('think.activityHistory', 'Activity') : isLive ? i18n('think.thinking', 'Thinking…') : i18n('think.summary', 'Thought summary')}
            </span>
            {typeof elapsedSec === 'number' && elapsedSec > 0 ? (
              <span className="thinking-accordion-elapsed">({elapsedSec.toFixed(1)}s)</span>
            ) : null}
          </span>
          <span className="thinking-accordion-chev" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <path d="M4 6l4 4 4-4H4z" />
            </svg>
          </span>
        </button>
      </div>
      <div id={bodyId} className="thinking-accordion-body" aria-hidden={!isOpen} inert={!isOpen}>
        <div className="thinking-accordion-inner">
          {timeline.length ? <ol className="turn-activity-list">
            {timeline.map((entry) => <li key={entry.id} data-activity-id={entry.id} data-phase={entry.phase}>
              <span>{activityTitle(entry)}</span>
              <span className="turn-activity-phase">{i18n('think.activity.' + entry.phase, entry.phase)}</span>
            </li>)}
          </ol> : null}
          {(normalizedSummary && !timeline.some((entry) => entry.text === normalizedSummary)) || !timeline.length ? <div className="thinking-accordion-text">{displaySummary}</div> : null}
        </div>
      </div>
    </div>
  );
}

export default ThinkingAccordion;
