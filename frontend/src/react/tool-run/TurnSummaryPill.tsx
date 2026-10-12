import { useState } from 'react';
import { STROKE_ICONS, toolIcon } from '../../ui/icons/toolIcons.js';
import type { LegacyChatMessage, LiveTurnStatus } from '../types/domain';
import { turnSummaryOf } from './turnSummary';

export interface TurnSummaryPillProps {
  message: LegacyChatMessage;
  live?: boolean;
  messageId: string;
  status?: LiveTurnStatus;
}

/**
 * The one line that says a turn did work, at the top of the answer.
 *
 * Closed, it is a label and nothing else — no panel, no overlay, no icon
 * slot competing with the answer. Clicking opens the detailed thinking
 * chain and summary, showing step-by-step reasoning just like ChatGPT/Qwen.
 */
export function TurnSummaryPill({ message, live, messageId, status }: TurnSummaryPillProps) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);

  const view = turnSummaryOf(message, Boolean(live), Boolean(status));
  if (!view.hasWork) return null;

  const liveTool = status?.phase === 'tool-running' && status.toolName;
  // A turn is actively thinking live ONLY when live is true, phase is thinking,
  // and public answer text has not yet started streaming.
  const isThinkingLive = Boolean(live && (status?.phase === 'thinking' || (!message.rawText && view.hasThinking)));
  const reasoningContent = typeof message.reasoningContent === 'string' ? message.reasoningContent.trim() : '';

  // Auto-expand during active live thinking; collapse by default once thinking ends.
  // If the user explicitly clicked the pill, respect the user's explicit open state.
  const open = userOpen !== null ? userOpen : isThinkingLive;

  // Single authority for time:
  // If the label already includes duration (e.g. "已深度思考 (3 秒)" or "Thought for 3s"),
  // DO NOT display elapsed time separately — this eliminates duplicate time hints.
  // Only display ticking elapsed seconds while actively thinking/waiting without an embedded duration.
  const labelText = (status?.label && isThinkingLive) ? status.label : view.label;
  const labelHasDuration = Boolean(view.durationSec > 0 || labelText.includes('秒') || /\b\d+s\b/i.test(labelText));
  const elapsed = (!labelHasDuration && isThinkingLive && status?.elapsedSec) ? `${status.elapsedSec}s` : '';

  return (
    <details
      className="turn-summary thinking-summary"
      data-message-id={messageId}
      open={open}
    >
      <summary
        className={`turn-summary-pill${status ? ' thinking-status' : ''}`}
        aria-expanded={open}
        data-mode={status?.mode}
        data-state={status?.state || undefined}
        onClick={(event) => {
          event.preventDefault();
          setUserOpen(!open);
        }}
      >
        {/* Only a deferred live tool needs a glyph. Settled thought headings
            remain plain text; their chevron is the disclosure affordance. */}
        {liveTool ? (
          <span className="tool-inline-tool-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: toolIcon(status!.toolName!) }} />
        ) : null}
        <span className="turn-summary-label thinking-status-label" aria-live="polite" aria-atomic="true">
          {labelText}
        </span>
        {elapsed ? <span className="thinking-status-detail">{elapsed}</span> : null}
        <span className="turn-summary-chevron" aria-hidden="true" dangerouslySetInnerHTML={{ __html: STROKE_ICONS.chevronRight }} />
      </summary>
      {open ? (
        <div className="turn-summary-detail" role="region" aria-label={view.label}>
          {reasoningContent || isThinkingLive ? (
            <div className="turn-summary-thinking-content">
              {reasoningContent ? (
                <pre className="turn-summary-thinking-text">{reasoningContent}</pre>
              ) : null}
              {isThinkingLive ? <span className="stream-cursor is-thinking" aria-hidden="true">▍</span> : null}
            </div>
          ) : null}
          {view.summary ? (
            <p className="turn-summary-text">{view.summary}</p>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}

export default TurnSummaryPill;
