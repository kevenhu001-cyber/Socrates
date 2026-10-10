import { useEffect, useRef, useState } from 'react';
import { i18n } from '../legacy/gateway.ts';
import { STROKE_ICONS } from '../../ui/icons/toolIcons.js';

export interface ThoughtBlockProps {
  reasoning: string;
  isLive?: boolean;
  elapsedSec?: number;
}

export function ThoughtBlock({ reasoning, isLive = false, elapsedSec }: ThoughtBlockProps) {
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  /* Open by default during streaming so user sees live thought progress;
     collapsed by default once settled so final answer takes focus. */
  const isOpen = userToggled !== null ? userToggled : Boolean(isLive);

  useEffect(() => {
    if (isLive && isOpen && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [reasoning, isLive, isOpen]);

  const cleanText = (reasoning || '').trim();
  if (!cleanText) return null;

  const elapsedText = elapsedSec && elapsedSec > 0
    ? (elapsedSec >= 60 ? `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s` : `${elapsedSec}s`)
    : '';

  return (
    <details
      className={`think-block${isLive ? ' think-block-streaming' : ''}`}
      open={isOpen}
      onToggle={(e) => setUserToggled((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="think-summary" role="button" aria-expanded={isOpen}>
        {isLive ? (
          <span className="thinking-spinner" aria-hidden="true" />
        ) : (
          <span
            className="tool-inline-tool-icon"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: STROKE_ICONS.agent }}
          />
        )}
        <span className="think-summary-label">
          {isLive
            ? i18n('think.thinking', '正在深度思考…')
            : i18n('think.doneThinking', '已深度思考')}
        </span>
        {elapsedText ? (
          <span className="think-summary-meta">
            {elapsedText}
          </span>
        ) : null}
        <span className="think-summary-chevron" aria-hidden="true" />
      </summary>
      <div className="think-content" ref={contentRef}>
        {cleanText}
      </div>
    </details>
  );
}

export default ThoughtBlock;
