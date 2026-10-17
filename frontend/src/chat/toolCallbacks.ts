/* chat/toolCallbacks — workflow/agent event publishers + stream tool-callback adapter.
 * Extracted from main.js. Zero-behavior-change lift. Template state reads via
 * window._activeTemplate (mirrored by setActiveTemplate in main.js).
 */
import { stateStore } from '../state/store.js';
import type { AgentRunEvent } from '../extensions/types.ts';
import type { StreamingTurnController } from './turnState.ts';

/** Bridges read from the legacy shell. */
interface ToolCallbacksWindow extends Window {
  _activeTemplate?: { runId?: string; workflow?: string } | null;
}

function activeTemplate(): { runId?: string; workflow?: string } | null {
  try {
    if (typeof window === 'undefined') return null;
    return (window as ToolCallbacksWindow)._activeTemplate || null;
  } catch { return null; }
}

function publishEvent(event: AgentRunEvent, extra?: Partial<AgentRunEvent> | null): void {
  const bridge = (window as ToolCallbacksWindow).__socratesAgentRunBridge;
  if (!bridge || typeof bridge.publish !== 'function') return;
  const merged: AgentRunEvent = extra ? Object.assign({}, event, extra) : event;
  // empty-catch: intentional — the agent-run bridge is optional and a publish
  // failure must never break the stream it reports on.
  try { bridge.publish(merged); } catch { /* optional bridge */ }
}

/* P_extension-runs — the chat pipeline publishes workflow-stage events
   for template extensions that carry a runId (research/explore). */
export function publishActiveWorkflowEvent(
  stage: AgentRunEvent['stage'],
  status: AgentRunEvent['status'],
  extra?: Partial<AgentRunEvent> | null,
): void {
  const tmpl = activeTemplate();
  if (!tmpl || !tmpl.runId || !tmpl.workflow) return;
  /* Template-authored workflow strings feed this event; the bridge union
     covers the known workflows and unknown ones stay a runtime value. */
  publishEvent({
    runId: tmpl.runId,
    workflow: tmpl.workflow as AgentRunEvent['workflow'],
    stage,
    status,
  }, extra);
}

export function publishActiveWorkflowFinish(ok: boolean): void {
  publishActiveWorkflowEvent(
    ok ? 'completed' : 'failed',
    ok ? 'succeeded' : 'failed',
    { message: ok ? 'Done' : (stateStore.read('lastCallError') || 'No response') },
  );
}

/* P_codex-agent-store — Codex runs use the same lightweight agent-run
 * bridge as Explore/Research. */
export function publishWorkspaceAgentEvent(
  runId: unknown,
  stage: AgentRunEvent['stage'],
  status: AgentRunEvent['status'],
  extra?: Partial<AgentRunEvent> | null,
): void {
  if (!runId) return;
  publishEvent({ runId: String(runId), workflow: 'agent', stage, status }, extra);
}

/** Fields the tool-callback adapter reads off stream frames. */
export interface ToolCallFrame {
  id?: string;
  name?: string;
}
export interface ToolResultFrame {
  id?: string;
  runId?: string;
  ok?: boolean;
  status?: string;
  error?: string;
}
export interface ToolProgressFrame {
  runId?: string;
  phase?: string;
  event?: string;
}
export type TurnSummaryFrame = string | { summary?: unknown; phase?: string } | null | undefined;

export function toolCallbacksForStream(ctl: StreamingTurnController) {
  return {
    onToolUse(calls: unknown): void {
      if (!Array.isArray(calls)) return;
      const list = calls as ToolCallFrame[];
      for (let i = 0; i < list.length; i++) {
        const call = list[i];
        ctl.recordToolUse(call);
        if (call && call.name === 'web_search') {
          publishActiveWorkflowEvent('searching', 'running',
            { message: 'Searching sources…', toolCallIds: call.id ? [call.id] : [] });
        }
      }
    },
    onToolResult(result: ToolResultFrame | null | undefined): void {
      ctl.recordToolResult(result);
      if (result && result.runId) {
        const agentWaiting = result.status === 'awaiting_approval';
        publishWorkspaceAgentEvent(
          result.runId,
          agentWaiting ? 'awaiting_approval' : (result.ok === false ? 'failed' : 'completed'),
          agentWaiting ? 'running' : (result.ok === false ? 'failed' : 'succeeded'),
          {
            message: result.error
              || (agentWaiting ? 'Approval required' : 'Codex workspace run finished'),
          },
        );
      }
      const tmpl = activeTemplate();
      if (result && result.id && tmpl && tmpl.runId) {
        publishActiveWorkflowEvent('reading', 'running',
          { message: 'Reading results…', toolCallIds: [result.id] });
      }
    },
    onToolApproval(approval: { runId?: string } | null | undefined): void {
      if (ctl.recordToolApproval) ctl.recordToolApproval(approval);
      if (approval && approval.runId) {
        publishWorkspaceAgentEvent(approval.runId, 'awaiting_approval', 'running',
          { message: 'Approval required' });
      }
    },
    onToolProgress(progress: ToolProgressFrame | null | undefined): void {
      if (ctl.recordToolProgress) ctl.recordToolProgress(progress);
      if (progress && progress.runId) {
        publishWorkspaceAgentEvent(
          progress.runId,
          progress.phase === 'planning' ? 'planning' : 'working',
          'running',
          { message: progress.event || progress.phase || 'Working' },
        );
      }
    },
    onExecutionStart(event: unknown): void {
      if (ctl.recordExecutionStart) ctl.recordExecutionStart(event);
    },
    /* P_codex-steps — Codex activity is rendered as its own step list in
       the message flow (运行了命令 / 编辑了文件 / 读取了文件 / 更新了计划),
       so the agent is no longer an opaque single card. */
    onAgentStep(step: unknown): void {
      if (step && ctl.recordAgentStep) ctl.recordAgentStep(step);
    },
    onAgentPlan(plan: unknown): void {
      if (plan && ctl.recordAgentPlan) ctl.recordAgentPlan(plan);
    },
    onToolCallDelta(delta: unknown): void {
      if (delta && ctl.recordToolCallDelta) ctl.recordToolCallDelta(delta);
    },
    /* Public progress and completed execution facts come from the server. */
    onTurnSnapshot(snapshot: unknown): void {
      if (ctl.recordTurnSnapshot) ctl.recordTurnSnapshot(snapshot);
    },
    onTurnEvent(event: unknown): void {
      if (ctl.recordTurnEvent) ctl.recordTurnEvent(event);
    },
    onTurnActivity(activity: unknown): void {
      if (ctl.recordTurnActivity) ctl.recordTurnActivity(activity);
    },
    onTurnSummary(payload: TurnSummaryFrame): void {
      const text = typeof payload === 'string' ? payload : (payload && payload.summary);
      if (!text || typeof ctl.recordTurnSummary !== 'function') return;
      const phase = payload && typeof payload !== 'string' ? payload.phase : undefined;
      ctl.recordTurnSummary(String(text), phase);
    },
  };
}
