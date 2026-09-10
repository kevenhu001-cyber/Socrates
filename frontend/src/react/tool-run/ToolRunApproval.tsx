/**
 * react/tool-run/ToolRunApproval.tsx — a decision the run is blocked on.
 *
 * The agent pauses mid-turn whenever it wants to run a command or change files,
 * and the prompt used to be DOM that chat/toolRuntime.ts hung off the live row.
 * That made it a second-class citizen: it survived re-painting of the row but
 * vanished whenever React rebuilt the bubble, leaving a run waiting on a
 * question nobody could see. It now renders from `call.approval` like anything
 * else, and the runtime keeps `approval.ui` current while the POST is in
 * flight so the status line ("Saving your decision…", "Approved") arrives as
 * data rather than as a textContent write into nodes it no longer owns.
 */
import { getLegacyActions, i18n } from '../legacy/gateway.js';
import type { ApprovalView } from './toolRunModel';

export interface ToolRunApprovalProps {
  view: ApprovalView;
  /** Which turn the prompt belongs to — the runtime resolves the entry from it. */
  messageId: string;
  toolCallId: string;
  /** Share / history: the run is gone, so show the outcome without controls. */
  readOnly?: boolean;
}

const DECISIONS: ReadonlyArray<{ decision: string; key: string; fallback: string; primary?: boolean }> = [
  { decision: 'accept', key: 'tool.approveOnce', fallback: 'Allow once', primary: true },
  { decision: 'acceptForSession', key: 'tool.approveRun', fallback: 'Allow this run' },
  { decision: 'decline', key: 'tool.decline', fallback: 'Decline' },
  { decision: 'stop', key: 'tool.stopRun', fallback: 'Stop run' },
];

export function ToolRunApproval({ view, messageId, toolCallId, readOnly }: ToolRunApprovalProps) {
  const decide = (decision: string) => async (event: React.MouseEvent<HTMLButtonElement>) => {
    /* The legacy path answers approvals through a delegated document listener;
       stop here so a decision is never submitted twice. */
    event.preventDefault();
    event.stopPropagation();
    try {
      await getLegacyActions().liveTurn?.decideApproval(messageId, toolCallId, decision);
    } catch (_) {
      /* The runtime recorded the failure in `approval.ui` (and re-enabled the
         buttons), so the panel already shows what went wrong. */
    }
  };

  return (
    <div
      className="tool-inline-approval"
      data-approval-id={view.approvalId}
      data-run-id={view.runId}
      data-state={view.state}
      role="alert"
      aria-live="polite"
    >
      <div className="tool-inline-approval-heading">
        <span className="tool-inline-approval-dot" aria-hidden="true" />
        <strong>{view.title}</strong>
      </div>
      <p className="tool-inline-approval-copy">
        {i18n('tool.codexApprovalCopy', 'Review the action before it continues.')}
      </p>
      {view.facts.map((fact) => (
        <div className="tool-inline-approval-fact" key={fact.label}>
          <span className="tool-inline-approval-fact-label">{fact.label}</span>
          <code className="tool-inline-approval-fact-value">{fact.value}</code>
        </div>
      ))}
      <div className="tool-inline-approval-status">{view.status}</div>
      {readOnly ? null : (
        <div className="tool-inline-approval-actions">
          {DECISIONS.map((spec) => (
            <button
              type="button"
              key={spec.decision}
              className={`tool-inline-approval-action${spec.primary ? ' primary' : ''}`}
              data-approval-action={spec.decision}
              disabled={view.disabled}
              onClick={decide(spec.decision)}
            >
              {i18n(spec.key, spec.fallback)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ToolRunApproval;
