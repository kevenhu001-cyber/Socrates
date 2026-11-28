/**
 * react/tool-run/ToolRunApproval.tsx — a decision the run is blocked on.
 *
 * Renders from `call.approval`; the runtime keeps `approval.ui` current while
 * the POST is in flight, so the status line ("Saving your decision…",
 * "Approved") arrives as data. The web surface keeps the action and its
 * destination legible without duplicating the activity summary.
 */
import type { ApprovalDecisionView } from '@socrates/ui/turn';
import { UiButton } from '@socrates/ui/primitives';
import { getLegacyActions } from '../legacy/gateway.ts';
import { i18n } from '../../ui/legacyI18n.ts';
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

const DECISIONS: ReadonlyArray<{
  decision: ApprovalDecision;
  key: string;
  fallback: string;
  variant: ApprovalDecisionView['variant'];
}> = [
  { decision: 'accept', key: 'tool.approveOnce', fallback: 'Allow once', variant: 'primary' },
  {
    decision: 'acceptForSession',
    key: 'tool.approveRun',
    fallback: 'Allow this run',
    variant: 'secondary',
  },
  { decision: 'decline', key: 'tool.decline', fallback: 'Decline', variant: 'secondary' },
  { decision: 'stop', key: 'tool.stopRun', fallback: 'Stop run', variant: 'ghost' },
];

export function ToolRunApproval({
  view,
  messageId,
  toolCallId,
  readOnly,
}: Readonly<ToolRunApprovalProps>) {
  const decide = async (decision: ApprovalDecision) => {
    try {
      await getLegacyActions().liveTurn?.decideApproval(messageId, toolCallId, decision);
    } catch (_) {
      reportEmptyCatch(_, 'empty catch: react/tool-run/ToolRunApproval.tsx:decide');
      /* The runtime recorded the failure in `approval.ui` (and re-enabled the
         buttons), so the panel already shows what went wrong. */
    }
  };
  const decisions = DECISIONS.filter((spec) => view.decisions.includes(spec.decision)).map(
    (spec) => ({ id: spec.decision, label: i18n(spec.key, spec.fallback), variant: spec.variant }),
  );

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
        <div className="tool-approval-card" data-testid="tool-approval">
          <div className="tool-approval-heading" data-testid="tool-approval-title">
            {view.title}
          </div>
          {view.state === 'pending' ? (
            <p className="tool-approval-description">
              {i18n('tool.codexApprovalCopy', 'Review the action before it continues.')}
            </p>
          ) : null}
          {view.state === 'pending' && view.facts.length ? (
            <dl className="tool-approval-facts">
              {view.facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {view.status ? (
            <div
              className="tool-approval-status"
              data-testid="tool-approval-status"
              role="status"
              aria-live="polite"
            >
              {view.status}
            </div>
          ) : null}
          {!readOnly && !view.disabled && view.state === 'pending' ? (
            <div className="tool-approval-decisions">
              {decisions.map((decision) => (
                <UiButton
                  key={decision.id}
                  testID={`tool-approval-${decision.id}`}
                  label={decision.label}
                  variant={decision.variant}
                  size="sm"
                  onPress={() => void decide(decision.id)}
                  dataSet={{ approvalAction: decision.id }}
                />
              ))}
            </div>
          ) : null}
        </div>
      </WebUiTheme>
    </div>
  );
}

export default ToolRunApproval;
