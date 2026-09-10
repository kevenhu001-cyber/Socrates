/**
 * workspace_agent executor — Pi Agent adapter.
 *
 * One `pi --mode json` process runs each agent turn with cwd pinned to the
 * server-owned conversation workspace. Pi's JSON event stream is projected
 * into the existing chat tool protocol (`tool_progress`, `agent_step`,
 * `tool_result`) so the browser renders commands / file reads / edits
 * without knowing anything about the Pi wire format.
 *
 * The durable workspace row (limits, disk gate) is still owned by the
 * agent runtime; Pi only executes inside the directory it resolves.
 */

import { getWorkspaceContext } from '../../../../services/agentRuntime.js';
import { runPiAgentTask, type PiAgentEvent, type PiAgentProvider } from '../../../../services/piAgent.js';
import { getActiveApiKey } from '../../../../services/apiKey.js';
import { checkBeagleMonthlyLimit } from '../../helpers.js';
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
  const { emitter, req, sessionIdFromQuery, projectIdFromBody, abortSignal } = ctx;
  const tc = call;

  const task = String(args.task || '').trim();
  if (!task) {
    const result: ToolResult = { status: 'failed', error: 'missing_task', errorCode: 'missing_task', retryable: false };
    emitter.event('tool_result', {
      id: tc.id, name: 'workspace_agent', ok: false, status: 'failed', output: '',
      error: 'missing_task', errorCode: 'missing_task', retryable: false,
      userMessage: '请提供要交给工作代理的任务。',
    });
    return { result };
  }

  if (!sessionIdFromQuery && !projectIdFromBody) {
    const result: ToolResult = { status: 'failed', error: 'missing_workspace_scope', errorCode: 'missing_workspace_scope', retryable: false };
    emitter.event('tool_result', {
      id: tc.id, name: 'workspace_agent', ok: false, status: 'failed', output: '',
      error: 'missing_workspace_scope', errorCode: 'missing_workspace_scope', retryable: false,
      userMessage: '当前对话没有可用的工作区。',
    });
    return { result };
  }

  let workspace;
  try {
    workspace = await getWorkspaceContext(req.userId!, sessionIdFromQuery, projectIdFromBody);
  } catch (err) {
    const message = (err as Error)?.message || 'workspace unavailable';
    const result: ToolResult = { status: 'failed', error: message, errorCode: 'workspace_unavailable', retryable: false };
    emitter.event('tool_result', {
      id: tc.id, name: 'workspace_agent', ok: false, status: 'failed', output: '',
      error: message, errorCode: 'workspace_unavailable', retryable: false,
    });
    return { result };
  }

  if (!workspace.disk.ok) {
    const message = `workspace_disk_limit: ${workspace.disk.usageBytes} bytes used, ${workspace.disk.maxBytes} bytes allowed. Reset the workspace or raise max_disk_mb.`;
    const result: ToolResult = { status: 'failed', error: message, errorCode: 'workspace_disk_limit', retryable: false };
    emitter.event('tool_result', {
      id: tc.id, name: 'workspace_agent', ok: false, status: 'failed', output: '',
      error: message, errorCode: 'workspace_disk_limit', retryable: false,
    });
    return { result };
  }

  emitter.event('tool_progress', {
    id: tc.id, phase: 'planning', chunk: '', elapsedMs: 0,
  });

  /* Follow the user's selected model: Pi runs against the same endpoint,
     model, and key the chat turn would use, so agent output matches the
     model picker. The built-in Beagle provider keeps its monthly gate. */
  let piProvider: PiAgentProvider | null = null;
  try {
    const provider = await getActiveApiKey(req.userId!);
    if (provider?.url && provider.model) {
      if (provider.isBuiltIn) {
        const limitErr = await checkBeagleMonthlyLimit(req.userId!, req.user?.tier);
        if (limitErr) {
          const message = limitErr.message || 'monthly_limit';
          const result: ToolResult = { status: 'failed', error: message, errorCode: 'monthly_limit', retryable: false };
          emitter.event('tool_result', {
            id: tc.id, name: 'workspace_agent', ok: false, status: 'failed', output: '',
            error: message, errorCode: 'monthly_limit', retryable: false,
          });
          return { result };
        }
      }
      piProvider = {
        baseUrl: String(provider.url).replace(/\/+$/, ''),
        model: String(provider.model),
        apiKey: provider.keyPlaintext || null,
      };
    }
  } catch (err) {
    /* Provider lookup is best-effort: fall back to Pi's own configuration. */
    console.warn('[workspace_agent] provider lookup failed:', (err as Error).message);
  }

  const onEvent = (event: PiAgentEvent) => {
    if (event.type === 'step_start' && event.step) {
      emitter.event('agent_step', {
        id: tc.id,
        type: 'step',
        stepId: event.step.stepId,
        kind: event.step.kind,
        title: event.step.title,
        detail: event.step.detail,
        command: event.step.command,
        status: 'running',
        exitCode: null,
        durationMs: null,
        diffStat: null,
        output: null,
      });
      return;
    }
    if (event.type === 'step_end' && event.step) {
      emitter.event('agent_step', {
        id: tc.id,
        type: 'step',
        stepId: event.step.stepId,
        kind: event.step.kind,
        title: event.step.title,
        detail: event.step.detail,
        command: event.step.command,
        status: event.step.status,
        exitCode: event.step.isError ? 1 : 0,
        durationMs: null,
        diffStat: null,
        output: event.step.output,
      });
      return;
    }
    if (event.type === 'delta' && event.chunk) {
      emitter.event('tool_progress', {
        id: tc.id, phase: 'working', chunk: event.chunk, elapsedMs: 0,
      });
      return;
    }
    if (event.type === 'reasoning' && event.chunk) {
      emitter.event('tool_progress', {
        id: tc.id, phase: 'working', chunk: event.chunk, event: 'reasoning', elapsedMs: 0,
      });
      return;
    }
    if (event.type === 'step_update' && event.chunk) {
      emitter.event('tool_progress', {
        id: tc.id, phase: 'working', chunk: event.chunk, elapsedMs: 0,
      });
    }
  };

  const sessionKey = sessionIdFromQuery || projectIdFromBody || 'workspace';
  const agentResult = await runPiAgentTask({
    task,
    workspacePath: workspace.path,
    sessionId: `socrates-${sessionKey}`,
    signal: abortSignal,
    limits: { maxMemoryMb: workspace.limits.maxMemoryMb },
    provider: piProvider,
    onEvent,
  });

  const ok = agentResult.status === 'completed';
  const result: ToolResult = {
    status: ok ? 'completed' : 'failed',
    output: agentResult.output || '',
    error: agentResult.error,
    errorCode: ok ? null : 'workspace_agent_failed',
    retryable: false,
    workspaceId: workspace.workspaceId,
  };
  emitter.event('tool_result', {
    id: tc.id,
    name: 'workspace_agent',
    ok,
    status: ok ? 'completed' : 'failed',
    output: agentResult.output || '',
    error: agentResult.error,
    errorCode: ok ? null : 'workspace_agent_failed',
    retryable: false,
    workspaceId: workspace.workspaceId,
  });
  return { result };
};
