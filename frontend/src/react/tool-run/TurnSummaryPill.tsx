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
  const [userToggled, setUserToggled] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const view = turnSummaryOf(message, Boolean(live), Boolean(status));
  if (!view.hasWork) return null;
  // Only display ticking elapsed seconds while live status is active;
  // settled turns already have the formatted duration inside view.label.
  const elapsed = status?.elapsedSec ? `${status.elapsedSec}s` : '';
  const liveTool = status?.phase === 'tool-running' && status.toolName;
  const isThinkingLive = Boolean(live && (status?.phase === 'thinking' || (!message.rawText && view.hasThinking)));
  const reasoningContent = typeof message.reasoningContent === 'string' ? message.reasoningContent.trim() : '';

  // Auto-expand only while actively thinking live; collapse by default once thinking ends.
  // If the user manually toggles the card, respect the user's explicit open state.
  const open = userToggled ? userOpen : isThinkingLive;

  return (
    <details
      className="turn-summary thinking-summary"
      data-message-id={messageId}
      open={open}
      onToggle={(event) => {
        setUserToggled(true);
        setUserOpen(event.currentTarget.open);
      }}
    >
      <summary
        className={`turn-summary-pill${status ? ' thinking-status' : ''}`}
        aria-expanded={open}
        data-mode={status?.mode}
        data-state={status?.state || undefined}
      >
        {/* Only a deferred live tool needs a glyph. Settled thought headings
            remain plain text; their chevron is the disclosure affordance. */}
        {liveTool ? (
          <span className="tool-inline-tool-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: toolIcon(status!.toolName!) }} />
        ) : null}
        <span className="turn-summary-label thinking-status-label" aria-live="polite" aria-atomic="true">
          {status?.label || view.label}
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
          ) : view.summary ? (
            <p className="turn-summary-text">{view.summary}</p>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}

export default TurnSummaryPill;
