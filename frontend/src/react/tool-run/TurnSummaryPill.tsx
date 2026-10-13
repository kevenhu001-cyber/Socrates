import type { LiveTurnStatus } from '../types/domain';
import { ToolActivityIcon } from './ToolActivityIcon';

export interface TurnSummaryPillProps {
  summary?: string;
  messageId: string;
  status?: LiveTurnStatus;
}

/** Display only the activity selected by the turn presentation controller. */
export function TurnSummaryPill({ summary, messageId, status }: TurnSummaryPillProps) {
  if (!summary && !status) return null;
  return (
    <div className="turn-summary thinking-summary" data-message-id={messageId}>
      {status ? (
        <div className="turn-summary-status thinking-status" data-mode={status.mode} data-state={status.state || undefined} role="status">
          {status.phase === 'tool-running' && status.toolName ? <ToolActivityIcon name={status.toolName} /> : null}
          <span className="turn-summary-label thinking-status-label">{status.label}</span>
          {status.elapsedSec ? <span className="thinking-status-detail">{status.elapsedSec}s</span> : null}
        </div>
      ) : summary ? <p className="turn-summary-text"><span>{summary}</span></p> : null}
    </div>
  );
}

export default TurnSummaryPill;
