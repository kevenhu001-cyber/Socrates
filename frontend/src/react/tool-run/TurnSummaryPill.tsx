import type { LiveTurnStatus } from '../types/domain';
import { ToolActivityIcon } from './ToolActivityIcon';

export interface TurnSummaryPillProps {
  /** Intent or completed observation; never public reasoning. */
  summary?: string;
  summaryKind?: 'intent' | 'outcome';
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
export function TurnSummaryPill({ summary, summaryKind = 'outcome', messageId, status }: TurnSummaryPillProps) {
  if (!summary && !status) return null;
  const active = status ? ACTIVE_PHASES.has(status.phase) : false;
  return (
    <div
      className="turn-surface-status turn-summary thinking-summary"
      data-message-id={messageId}
      data-turn-surface-part="activity"
    >
      {status ? (
        <div className="turn-summary-status thinking-status" data-mode={status.mode} data-phase={status.phase} data-state={status.state || undefined} role="status">
          {status.phase === 'tool-running' && status.toolName ? <ToolActivityIcon name={status.toolName} /> : null}
          <span className={`turn-summary-label thinking-status-label${active ? ' shimmer-text' : ''}`}>{status.label}</span>
          {status.elapsedSec ? <span className="thinking-status-detail">{status.elapsedSec}s</span> : null}
        </div>
      ) : null}
      {summary ? <p className="turn-summary-text" data-summary-kind={summaryKind}><span>{summary}</span></p> : null}
    </div>
  );
}

export default TurnSummaryPill;
