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
 * slot competing with the answer. The public summary lives inside the body,
 * while execution facts remain in the ordered tool rows, so a long summary collapses to one
 * line instead of pushing the answer down.
 *
 * While the turn is live the same element doubles as the phase line, and it
 * takes the tool glyph the running call will use — so the reader sees the
 * transition happen rather than two unrelated spinners swap.
 */
export function TurnSummaryPill({ message, live, messageId, status }: TurnSummaryPillProps) {
  const [open, setOpen] = useState(false);
  const view = turnSummaryOf(message, Boolean(live), Boolean(status));
  if (!view.hasWork) return null;
  const elapsed = status?.elapsedSec && status.elapsedSec >= 12 ? `${status.elapsedSec}s` : '';
  const liveTool = status?.phase === 'tool-running' && status.toolName;

  return (
    <details
      className="turn-summary thinking-summary"
      data-message-id={messageId}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
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
        <div className="turn-summary-detail">
          <p className="turn-summary-text">{view.summary}</p>
        </div>
      ) : null}
    </details>
  );
}

export default TurnSummaryPill;
