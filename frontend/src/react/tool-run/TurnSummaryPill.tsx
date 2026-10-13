import type { LegacyChatMessage, LiveTurnStatus } from '../types/domain';
import { ToolActivityIcon } from './ToolActivityIcon';
import { turnSummaryOf } from './turnSummary';

export interface TurnSummaryPillProps {
  message: LegacyChatMessage;
  live?: boolean;
  messageId: string;
  status?: LiveTurnStatus;
}

/** Public summaries are readable gray prose. Provider reasoning remains only
 * a presence/duration signal and is never displayed in the transcript. */
export function TurnSummaryPill({ message, live, messageId, status }: TurnSummaryPillProps) {
  const view = turnSummaryOf(message, Boolean(live), Boolean(status));
  if (!view.hasWork) return null;

  const publicSummary = message.summary?.trim() || (live ? message._taskSummary?.trim() : '') || '';
  if (live && !publicSummary && !status) return null;
  const label = status?.label || view.label;
  // A mounted tool row owns progress. A deferred row still needs its current
  // action here while the paragraph preceding it is unfinished.
  const showStatus = Boolean(status && (!publicSummary || status.phase === 'tool-running' || status.phase === 'retrying'));
  const summaryIsLive = Boolean(status && !showStatus);

  return (
    <div className="turn-summary thinking-summary" data-message-id={messageId}>
      {showStatus || !publicSummary ? (
        <div className={`turn-summary-status${status ? ' thinking-status' : ''}`} data-mode={status?.mode} data-state={status?.state || undefined} role="status">
          {status?.phase === 'tool-running' && status.toolName ? <ToolActivityIcon name={status.toolName} /> : null}
          <span className="turn-summary-label thinking-status-label">{label}</span>
          {live && status?.elapsedSec && !view.durationSec && !/\d+(?:s|秒)/.test(label)
            ? <span className="thinking-status-detail">{status.elapsedSec}s</span> : null}
        </div>
      ) : null}
      {publicSummary ? (
        <p className={`turn-summary-text${summaryIsLive ? ' thinking-status' : ''}`} role={summaryIsLive ? 'status' : undefined}>
          <span className={summaryIsLive ? 'thinking-status-label' : undefined}>{publicSummary}</span>
        </p>
      ) : null}
    </div>
  );
}

export default TurnSummaryPill;
