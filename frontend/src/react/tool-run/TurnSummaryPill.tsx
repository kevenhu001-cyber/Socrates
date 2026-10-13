import type { LiveTurnStatus } from '../types/domain';
import { ToolActivityIcon } from './ToolActivityIcon';

export interface TurnSummaryPillProps {
  summary?: string;
  messageId: string;
  status?: LiveTurnStatus;
}

const ACTIVE_PHASES = new Set<LiveTurnStatus['phase']>([
  'waiting',
  'thinking',
  'synthesizing',
  'retrying',
  'tool-running',
]);

/** Display only the activity selected by the turn presentation controller. */
export function TurnSummaryPill({ summary, messageId, status }: TurnSummaryPillProps) {
  if (!summary && !status) return null;
  const active = status ? ACTIVE_PHASES.has(status.phase) : false;
  return (
    <div className="turn-summary thinking-summary" data-message-id={messageId}>
      {status ? (
        <div className="turn-summary-status thinking-status" data-mode={status.mode} data-state={status.state || undefined} role="status">
          {status.phase === 'tool-running' && status.toolName ? <ToolActivityIcon name={status.toolName} /> : null}
          <span className={`turn-summary-label thinking-status-label${active ? ' shimmer-text' : ''}`}>{status.label}</span>
          {status.elapsedSec ? <span className="thinking-status-detail">{status.elapsedSec}s</span> : null}
        </div>
      ) : summary ? <p className="turn-summary-text"><span>{summary}</span></p> : null}
    </div>
  );
}

export default TurnSummaryPill;
