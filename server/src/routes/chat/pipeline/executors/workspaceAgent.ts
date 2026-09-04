/**
 * workspace_agent executor — unified Codex adapter.
 *
 * Creates the durable run before starting the turn so the browser can
 * render a stable run id, reconnect to /events, and answer approvals
 * after a refresh. Runtime events are projected into the existing chat
 * tool protocol; the frontend never needs to know Codex's wire
 * notification names.
 */

import {
  createAgentRun,
  runAgentTurn,
  subscribeToAgentRun,
  type AgentRuntimeEvent,
} from '../../../../services/agentRuntime.js';
import { projectAgentEvent } from '../../../../services/agentStepProjection.js';
import type {
  ToolExecutor,
  ToolExecutionResult,
} from './types.js';
import type { ToolResult } from '../types.js';

export const executeWorkspaceAgent: ToolExecutor = async (
  args,
  call,
  ctx,
): Promise<ToolExecutionResult> => {
  const { emitter, req, sessionIdFromQuery, projectIdFromBody, mode, abortSignal } = ctx;
  const tc = call;
  let result: ToolResult;

  const task = String(args.task || '').trim();
  if (!task) {
    result = { status: 'failed', error: 'missing_task', errorCode: 'missing_task', retryable: false };
    emitter.event('tool_result', {
      id: tc.id, name: 'workspace_agent', ok: false, status: 'failed', output: '',
      error: 'missing_task', errorCode: 'missing_task', retryable: false,
      userMessage: '请提供要交给 Codex 工作代理的任务。',
    });
    return { result };
  }

  const created = await createAgentRun({
    userId: req.userId!,
    task,
    sessionId: sessionIdFromQuery,
    projectId: projectIdFromBody,
    kind: mode === 'tutor' ? 'tutor' : 'chat',
    source: mode === 'tutor' ? 'tutor' : 'chat',
  });
  const runId = created.run.id;
  emitter.event('tool_progress', {
    id: tc.id, runId, phase: 'planning', chunk: '', elapsedMs: 0,
  });
  const unsubscribe = subscribeToAgentRun(runId, (event: AgentRuntimeEvent) => {
    const data = event.data || {};
    const phase = event.event === 'approval_required'
      ? 'awaiting_approval'
      : event.event === 'run_completed' || event.event === 'run_failed' || event.event === 'run_interrupted'
        ? 'completed'
        : event.event === 'tool' || event.event === 'tool_output' || event.event === 'item_started' || event.event === 'item_completed'
          ? 'working'
          : 'working';
    if (event.event === 'approval_required') {
      emitter.event('tool_approval', {
        id: tc.id,
        runId,
        approvalId: data.approvalId || data.requestId,
        requestId: data.requestId,
        kind: data.kind,
        reason: data.reason || null,
        command: data.command || null,
        cwd: '[workspace]',
        changes: data.changes || null,
        availableDecisions: data.availableDecisions || ['accept', 'decline'],
      });
    } else {
      /* Step-level streaming: each Codex thread item becomes an
         `agent_step` frame the chat renders as its own row
         (运行了命令 / 编辑了文件 / 读取了文件 …), and the
         model's todo list becomes an `agent_plan` frame that
         updates one card in place. `tool_progress` is still
         emitted for every event so older clients (mobile,
         cached bundles) keep working unchanged. */
      const projected = projectAgentEvent(event);
      if (projected?.type === 'step') {
        emitter.event('agent_step', {
          id: tc.id, runId, ...projected,
        });
      } else if (projected?.type === 'plan') {
        emitter.event('agent_plan', {
          id: tc.id, runId, ...projected,
        });
      }
      const chunk = event.event === 'delta' || event.event === 'reasoning' || event.event === 'tool_output'
        ? String(data.delta || '')
        : '';
      emitter.event('tool_progress', {
        id: tc.id, runId, phase, chunk, event: event.event,
        itemId: data.itemId || null, command: data.command || null,
        elapsedMs: 0,
      });
    }
  });
  try {
    const agentResult = await runAgentTurn(runId, req.userId!, undefined, abortSignal);
    result = {
      status: agentResult.status,
      output: agentResult.output || agentResult.summary || '',
      error: agentResult.error || null,
      errorCode: agentResult.error ? 'workspace_agent_failed' : null,
      retryable: false,
      runId: agentResult.runId,
      threadId: agentResult.threadId,
      workspaceId: agentResult.workspaceId,
      artifacts: agentResult.artifacts || [],
    };
    emitter.event('tool_result', {
      id: tc.id,
      name: 'workspace_agent',
      runId: agentResult.runId,
      ok: agentResult.status === 'completed' || agentResult.status === 'awaiting_approval',
      status: agentResult.status,
      output: agentResult.output || agentResult.summary || '',
      error: agentResult.error || null,
      errorCode: agentResult.error ? 'workspace_agent_failed' : null,
      artifacts: agentResult.artifacts || [],
      retryable: false,
    });
  } finally {
    unsubscribe();
  }
  return { result };
};
