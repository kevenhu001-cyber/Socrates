import type { TurnActivityEntry } from '@socrates/contracts';
import { useEffect, useId, useReducer, useState } from 'react';
import { i18n } from '../legacy/gateway';

export interface ThinkingAccordionProps {
  /** Public model-provided summary only. Never pass parsed reasoning text here. */
  publicSummary?: string;
  activities?: ReadonlyArray<TurnActivityEntry>;
  isLive?: boolean;
  elapsedSec?: number;
  statusLabel?: string;
  showActivityCue?: boolean;
}

export function ThinkingAccordion({ publicSummary = '', activities = [], isLive = false, elapsedSec, statusLabel, showActivityCue = true }: ThinkingAccordionProps) {
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

  // Tool results already have their own rows. Only explicitly public reasoning
  // belongs inside this disclosure; generic progress is header chrome.
  const timeline = activities.filter((entry) => entry.kind === 'reasoning_summary' && entry.text?.trim())
    .filter((entry, index, entries) => !entries.slice(index + 1).some((other) => other.text?.trim() === entry.text?.trim()))
    .slice(-5);
  const summaries = timeline.length ? timeline : normalizedSummary ? [{ id: 'public-summary', text: normalizedSummary, phase: 'done' }] : [];
  if (!summaries.length) return null;
  const title = isLive ? statusLabel || i18n('think.thinking', 'Thinking…')
    : typeof elapsedSec === 'number' && Number.isFinite(elapsedSec) && elapsedSec > 0
      ? i18n('think.thoughtDuration', 'Thought for {sec}s').replace('{sec}', String(Math.max(1, Math.round(elapsedSec))))
      : i18n('think.summary', 'Thought summary');

  return (
    <div
      className="thinking-accordion"
      data-activity-timeline={timeline.length ? "true" : undefined}
      data-live={isLive && showActivityCue ? 'true' : undefined}
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
            <span className="thinking-dot-indicator" aria-hidden="true" hidden={!isLive || !showActivityCue}>
              <span className="thinking-dot-pulse">
                <span />
                <span />
                <span />
              </span>
              <span className="thinking-dot-calm" />
            </span>
            <span className="thinking-accordion-title">
              {title}
            </span>
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
          <ol className="turn-activity-list">
            {summaries.map((entry) => <li key={entry.id} data-activity-id={entry.id} data-phase={entry.phase}>
              <div className="thinking-accordion-text">{entry.text?.trim()}</div>
            </li>)}
          </ol>
        </div>
      </div>
    </div>
  );
}

export default ThinkingAccordion;
