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
 * Compact per-turn work disclosure.
 *
 * This surface deliberately exposes only public activity summaries. Provider
 * reasoning is retained on the message for persistence/model replay, but it is
 * never rendered here: the transcript should explain what the assistant did,
 * not expose a raw chain-of-thought stream. Tool execution facts remain owned
 * by ToolRunRow/ToolRunGroup, and artifacts remain outside this disclosure.
 */
export function TurnSummaryPill({ message, live, messageId, status }: TurnSummaryPillProps) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);

  const view = turnSummaryOf(message, Boolean(live), Boolean(status));
  if (!view.hasWork) return null;

  const liveTool = status?.phase === 'tool-running' && status.toolName;
  // A turn is actively thinking only before public answer text starts. The
  // reasoning payload is a semantic signal here, never display content.
  const isThinkingLive = Boolean(live && (status?.phase === 'thinking' || (!message.rawText && view.hasThinking)));

  // Open while active so the reader can see the public task/activity summary;
  // collapse after completion unless the user explicitly chose a state.
  const open = userOpen !== null ? userOpen : isThinkingLive;

  // One authority for duration. Completed duration belongs in the disclosure
  // label; the live ticker is only a fallback while the label has no duration.
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
        {/* A deferred live tool may use the same compact disclosure slot. */}
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
          <p className="turn-summary-text">{view.summary}</p>
        </div>
      ) : null}
    </details>
  );
}

export default TurnSummaryPill;
