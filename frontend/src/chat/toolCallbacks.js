/* chat/toolCallbacks.js — extracted from main.js.
 * Workflow/agent event publishers + stream tool-callback adapter.
 * Zero-behavior-change lift. Template state reads via window._activeTemplate
 * (mirrored by setActiveTemplate in main.js).
 */
import { stateStore } from '../state/store.js';

function _activeTemplate() {
  try {
    return (typeof window !== 'undefined' && window._activeTemplate) || null;
  } catch (_) {
    return null;
  }
}

/* P_extension-runs — the chat pipeline publishes workflow-stage events
   for template extensions that carry a runId (research/explore). */
export function publishActiveWorkflowEvent(stage, status, extra) {
  var tmpl = _activeTemplate();
  if (!tmpl || !tmpl.runId || !tmpl.workflow) return;
  var bridge = window.__socratesAgentRunBridge;
  if (!bridge || typeof bridge.publish !== 'function') return;
  var ev = { runId: tmpl.runId, workflow: tmpl.workflow, stage: stage, status: status };
  if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) ev[k] = extra[k];
  try { bridge.publish(ev); } catch (_) {}
}

export function publishActiveWorkflowFinish(ok) {
  publishActiveWorkflowEvent(ok ? 'completed' : 'failed', ok ? 'succeeded' : 'failed',
    { message: ok ? 'Done' : (stateStore.read('lastCallError') || 'No response') });
}

/* P_codex-agent-store — Codex runs use the same lightweight agent-run
 * bridge as Explore/Research. */
export function publishWorkspaceAgentEvent(runId, stage, status, extra) {
  if (!runId) return;
  var bridge = window.__socratesAgentRunBridge;
  if (!bridge || typeof bridge.publish !== 'function') return;
  var ev = { runId: String(runId), workflow: 'agent', stage: stage, status: status };
  if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) ev[k] = extra[k];
  try { bridge.publish(ev); } catch (_) { /* optional bridge */ }
}

export function toolCallbacksForStream(ctl) {
  return {
    onToolUse: function (calls) {
      if (!Array.isArray(calls)) return;
      for (var i = 0; i < calls.length; i++) {
        ctl.recordToolUse(calls[i]);
        if (calls[i] && calls[i].name === 'web_search') {
          publishActiveWorkflowEvent('searching', 'running',
            { message: 'Searching sources…', toolCallIds: [calls[i].id] });
        }
      }
    },
    onToolResult: function (result) {
      ctl.recordToolResult(result);
      if (result && result.runId) { var _agentWaiting = result.status === 'awaiting_approval'; publishWorkspaceAgentEvent(result.runId, _agentWaiting ? 'awaiting_approval' : result.ok === false ? 'failed' : 'completed', _agentWaiting ? 'running' : result.ok === false ? 'failed' : 'succeeded', { message: result.error || (_agentWaiting ? 'Approval required' : 'Codex workspace run finished') }); }
      var tmpl = _activeTemplate();
      if (result && result.id && tmpl && tmpl.runId) {
        publishActiveWorkflowEvent('reading', 'running', { message: 'Reading results…', toolCallIds: [result.id] });
      }
    },
    onToolApproval: function (approval) {
      if (ctl && typeof ctl.recordToolApproval === 'function') ctl.recordToolApproval(approval);
      if (approval && approval.runId) publishWorkspaceAgentEvent(approval.runId, 'awaiting_approval', 'running', { message: 'Approval required' });
    },
    onToolProgress: function (progress) {
      if (ctl.recordToolProgress) ctl.recordToolProgress(progress);
      if (progress && progress.runId) publishWorkspaceAgentEvent(progress.runId, progress.phase === 'planning' ? 'planning' : 'working', 'running', { message: progress.event || progress.phase || 'Working' });
    },
    onExecutionStart: function (event) { if (ctl.recordExecutionStart) ctl.recordExecutionStart(event); },
    /* P_codex-steps — Codex activity is rendered as its own step list in
       the message flow (运行了命令 / 编辑了文件 / 读取了文件 / 更新了计划),
       so the agent is no longer an opaque single card. */
    onAgentStep: function (step) { if (step && ctl.recordAgentStep) ctl.recordAgentStep(step); },
    onAgentPlan: function (plan) { if (plan && ctl.recordAgentPlan) ctl.recordAgentPlan(plan); },
    onToolCallDelta: function (delta) { if (delta && ctl.recordToolCallDelta) ctl.recordToolCallDelta(delta); }
  };
}
