import { apiFetch } from '../../util/api.js';

export interface ToolApproval {
  id?: string;
  runId: string;
  approvalId: string;
  requestId?: string;
  kind?: string;
  reason?: string | null;
  command?: string | null;
  cwd?: string | null;
  changes?: unknown;
  availableDecisions?: string[];
  status?: string;
  ui?: { text: string; state?: string; disabled?: boolean };
}

interface ApprovalToolCall {
  id: string;
  name: string;
  _toolResultApplied?: boolean;
  approval?: ToolApproval;
}

interface ApprovalMessage<TEntry extends ApprovalToolCall> {
  toolCalls?: TEntry[];
  _orphanApprovals?: Record<string, ToolApproval[]>;
}

interface ApprovalResult {
  id: string;
  name?: string;
  ok?: boolean;
  status?: string;
  output?: string;
  error?: string;
  artifacts?: Array<unknown>;
}

interface ApprovalRuntimeOptions<
  TEntry extends ApprovalToolCall,
  TMessage extends ApprovalMessage<TEntry>,
> {
  activeMessage: () => TMessage | null;
  findEntry: (message: TMessage | null, id: string) => TEntry | null;
  notifyToolRun: (message: TMessage | null) => void;
  pushOrphan: (message: TMessage, bucket: '_orphanApprovals', id: string, value: never) => void;
  recordToolResult: (result: ApprovalResult) => void;
  translate: (key: string, fallback: string) => string;
}

/** Own the decision POST, feedback state and paused-run completion polling. */
export function createApprovalRuntime<
  TEntry extends ApprovalToolCall,
  TMessage extends ApprovalMessage<TEntry>,
>(options: ApprovalRuntimeOptions<TEntry, TMessage>) {
  function setApprovalUi(approvalId: string, text: string, state?: string, disabled = true): void {
    const message = options.activeMessage();
    const calls = message && Array.isArray(message.toolCalls) ? message.toolCalls : [];
    for (const entry of calls) {
      if (!entry || !entry.approval || String(entry.approval.approvalId) !== String(approvalId)) continue;
      entry.approval = { ...entry.approval, ui: { text, state, disabled } };
    }
    if (message) options.notifyToolRun(message);
  }

  async function submitApprovalAction(
    approval: ToolApproval,
    entryId: string,
    decision: string,
  ): Promise<void> {
    if (!approval || !approval.runId || !approval.approvalId) return;
    setApprovalUi(approval.approvalId, options.translate('tool.sendingApproval', 'Saving your decision…'));
    try {
      if (decision === 'stop') {
        await apiFetch('/api/agent-runs/' + encodeURIComponent(approval.runId) + '/interrupt', { method: 'POST', body: {} });
        setApprovalUi(approval.approvalId, options.translate('tool.runStopped', 'Stop requested'), 'stopped');
        return;
      }
      await apiFetch('/api/agent-runs/' + encodeURIComponent(approval.runId) + '/approvals/' + encodeURIComponent(approval.approvalId), {
        method: 'POST',
        body: { decision },
      });
      setApprovalUi(
        approval.approvalId,
        decision === 'decline'
          ? options.translate('tool.approvalDeclined', 'Declined')
          : options.translate('tool.approvalAccepted', 'Approved'),
        decision === 'decline' ? 'declined' : 'accepted',
      );
      const message = options.activeMessage();
      const entry = options.findEntry(message, entryId);
      if (entry) entry.approval = { ...entry.approval, ...approval, status: decision };
      options.notifyToolRun(message);
      if (decision !== 'decline') {
        const startedAt = Date.now();
        const poll = async (): Promise<void> => {
          if (Date.now() - startedAt > 120_000) return;
          try {
            const response = await apiFetch('/api/agent-runs/' + encodeURIComponent(approval.runId));
            const run = response && response.run;
            if (run && ['completed', 'failed', 'interrupted', 'disconnected'].includes(String(run.status))) {
              options.recordToolResult({
                id: entryId,
                name: entry ? entry.name : 'workspace_agent',
                ok: run.status === 'completed',
                status: run.status,
                output: run.summary || '',
                error: run.error || null,
                artifacts: response.artifacts || [],
              });
              return;
            }
          } catch (_) { /* a refresh/reconnect can retry on the next tick */ }
          window.setTimeout(() => { void poll(); }, 900);
        };
        window.setTimeout(() => { void poll(); }, 900);
      }
    } catch (err) {
      setApprovalUi(
        approval.approvalId,
        (err as Error).message || options.translate('tool.approvalFailed', 'Could not save the decision. Try again.'),
        undefined,
        false,
      );
      throw err;
    }
  }

  async function decideApproval(toolCallId: string, decision: string): Promise<void> {
    const message = options.activeMessage();
    const entry = options.findEntry(message, String(toolCallId || ''));
    if (!entry || !entry.approval || !decision) return;
    await submitApprovalAction(entry.approval, entry.id, decision);
  }

  function renderApproval(approval: ToolApproval): void {
    const message = options.activeMessage();
    if (!message || !approval || !approval.runId || !approval.approvalId) return;
    let entry = options.findEntry(message, String(approval.id || ''));
    if (!entry) {
      /* Keep a fallback for adapters that provide only runId/requestId. */
      const calls = Array.isArray(message.toolCalls) ? message.toolCalls : [];
      entry = calls.find((candidate) => candidate.approval && candidate.approval.runId === approval.runId) || null;
    }
    if (!entry) return;
    entry.approval = { ...approval, status: approval.status || 'pending' };
    options.notifyToolRun(message);
  }

  function recordToolApproval(approval: ToolApproval): void {
    const message = options.activeMessage();
    if (!message || !approval || !approval.runId || !approval.approvalId) return;
    let entry: TEntry | null = approval.id ? options.findEntry(message, String(approval.id)) : null;
    if (!entry && Array.isArray(message.toolCalls)) {
      /* A provider adapter may omit the presentation id. Attach the approval
         to the most recent active workspace-agent call in this message. */
      for (let index = message.toolCalls.length - 1; index >= 0; index--) {
        const candidate = message.toolCalls[index];
        if (candidate && candidate.name === 'workspace_agent' && !candidate._toolResultApplied) {
          entry = candidate;
          break;
        }
      }
    }
    if (!entry) {
      options.pushOrphan(message, '_orphanApprovals', String(approval.id || approval.runId), approval as never);
      return;
    }
    const normalized = { ...approval, id: entry.id };
    entry.approval = normalized;
    options.notifyToolRun(message);
    renderApproval(normalized);
  }

  return { decideApproval, renderApproval, recordToolApproval };
}
