import { useEffect, useId, useReducer, useState } from 'react';
import { i18n } from '../legacy/gateway';

export interface ThinkingAccordionProps {
  /** Public model-provided summary only. Never pass parsed reasoning text here. */
  publicSummary?: string;
  isLive?: boolean;
  elapsedSec?: number;
}

export function ThinkingAccordion({ publicSummary = '', isLive = false, elapsedSec }: ThinkingAccordionProps) {
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

  if (!normalizedSummary && !isLive) return null;

  return (
    <div
      className="thinking-accordion"
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
            <span className="thinking-dot-indicator" aria-hidden="true">
              <span className="thinking-dot-pulse">
                <span />
                <span />
                <span />
              </span>
              <span className="thinking-dot-calm" />
            </span>
            <span className="thinking-accordion-title">
              {isLive ? i18n('think.thinking', 'Thinking…') : i18n('think.summary', 'Thought summary')}
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
          <div className="thinking-accordion-text">{displaySummary}</div>
        </div>
      </div>
    </div>
  );
}

export default ThinkingAccordion;
