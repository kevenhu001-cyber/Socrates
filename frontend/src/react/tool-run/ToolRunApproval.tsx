/**
 * react/tool-run/ToolRunApproval.tsx — a decision the run is blocked on.
 *
 * Renders from `call.approval`; the runtime keeps `approval.ui` current while
 * the POST is in flight, so the status line ("Saving your decision…",
 * "Approved") arrives as data. RN-2 draws it with the shared RN card and pill
 * buttons; the DOM wrapper keeps the region semantics and data hooks.
 */
import { ToolApprovalCard, type ApprovalDecisionView } from '@socrates/ui/turn';
import { getLegacyActions, i18n } from '../legacy/gateway.ts';
import { WebUiTheme } from '../rn/WebUiTheme';
import type { ApprovalDecision, ApprovalView } from './toolRunModel';
import { reportSwallow as reportEmptyCatch } from '../../util/reportSwallow.ts';

export interface ToolRunApprovalProps {
  view: ApprovalView;
  /** Which turn the prompt belongs to — the runtime resolves the entry from it. */
  messageId: string;
  toolCallId: string;
  /** Share / history: the run is gone, so show the outcome without controls. */
  readOnly?: boolean;
}

const DECISIONS: ReadonlyArray<{ decision: ApprovalDecision; key: string; fallback: string; variant: ApprovalDecisionView['variant'] }> = [
  { decision: 'accept', key: 'tool.approveOnce', fallback: 'Allow once', variant: 'primary' },
  { decision: 'acceptForSession', key: 'tool.approveRun', fallback: 'Allow this run', variant: 'secondary' },
  { decision: 'decline', key: 'tool.decline', fallback: 'Decline', variant: 'secondary' },
  { decision: 'stop', key: 'tool.stopRun', fallback: 'Stop run', variant: 'ghost' },
];

export function ToolRunApproval({ view, messageId, toolCallId, readOnly }: ToolRunApprovalProps) {
  const decide = async (decision: ApprovalDecision) => {
    try {
      await getLegacyActions().liveTurn?.decideApproval(messageId, toolCallId, decision);
    } catch (_) {
      reportEmptyCatch(_, 'empty catch: react/tool-run/ToolRunApproval.tsx:decide');
      /* The runtime recorded the failure in `approval.ui` (and re-enabled the
         buttons), so the panel already shows what went wrong. */
    }
  };
  const decisions = DECISIONS
    .filter((spec) => view.decisions.includes(spec.decision))
    .map((spec) => ({ id: spec.decision, label: i18n(spec.key, spec.fallback), variant: spec.variant }));

  return (
    <div
      className="rn-tool-approval"
      data-approval-id={view.approvalId}
      data-run-id={view.runId}
      data-state={view.state}
      role="region"
      aria-label={view.title}
      aria-busy={view.disabled && view.state === 'pending' ? 'true' : undefined}
    >
      <WebUiTheme>
        <ToolApprovalCard
          title={view.title}
          badge={i18n('tool.status.awaiting', 'Needs approval')}
          description={i18n('tool.codexApprovalCopy', 'Review the action before it continues.')}
          facts={view.facts}
          status={view.status}
          decisions={decisions}
          showControls={!readOnly && !view.disabled && view.state === 'pending'}
          onDecide={(id) => { void decide(id as ApprovalDecision); }}
        />
      </WebUiTheme>
    </div>
  );
}

export default ToolRunApproval;
