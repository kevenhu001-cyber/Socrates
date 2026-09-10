/**
 * initialize_workspace executor — explicit, bounded workspace setup.
 *
 * The agent runtime lazily creates a workspace on the first
 * `workspace_agent` run; this tool lets the model establish it up front
 * with a declared resource budget so multi-step agent work has a known
 * sandbox. The server keeps ownership of the real filesystem path and the
 * sandbox/approval policy; the model only sees the normalized limits.
 */

import { updateWorkspacePolicy } from '../../../../services/agentRuntime.js';
import type {
  ToolExecutor,
  ToolExecutionResult,
} from './types.js';
import type { ToolResult } from '../types.js';

export const executeInitializeWorkspace: ToolExecutor = async (
  args,
  call,
  ctx,
): Promise<ToolExecutionResult> => {
  const { emitter, req, sessionIdFromQuery, projectIdFromBody } = ctx;
  const tc = call;

  if (!sessionIdFromQuery && !projectIdFromBody) {
    const result: ToolResult = {
      status: 'failed',
      error: 'missing_workspace_scope',
      errorCode: 'missing_workspace_scope',
      retryable: false,
    };
    emitter.event('tool_result', {
      id: tc.id,
      name: 'initialize_workspace',
      ok: false,
      status: 'failed',
      output: '',
      error: 'missing_workspace_scope',
      errorCode: 'missing_workspace_scope',
      retryable: false,
      userMessage: '当前对话没有可初始化的工作区。',
    });
    return { result };
  }

  try {
    const info = await updateWorkspacePolicy({
      userId: req.userId!,
      sessionId: sessionIdFromQuery,
      projectId: projectIdFromBody,
      maxMemoryMb: args.max_memory_mb,
      maxDiskMb: args.max_disk_mb,
      reset: args.reset === true,
    });
    const output = JSON.stringify({
      workspaceKey: info.workspaceKey,
      limits: {
        maxMemoryMb: info.policy.maxMemoryMb,
        maxDiskMb: info.policy.maxDiskMb,
      },
      usage: {
        diskBytes: info.snapshot.diskBytes,
        diskLimitBytes: info.snapshot.diskLimitBytes,
      },
      sandbox: {
        mode: info.policy.sandbox,
        approvalPolicy: info.policy.approvalPolicy,
        workingDirectory: '/workspace',
      },
      capabilities: ['files.read', 'files.write', 'shell.run', 'search', 'mcp'],
      note: 'The server owns the real workspace path. Use workspace_agent to run commands, edit files, and inspect the tree.',
    });
    const result: ToolResult = {
      status: 'completed',
      output,
      workspaceId: info.workspaceId,
    };
    emitter.event('tool_result', {
      id: tc.id,
      name: 'initialize_workspace',
      ok: true,
      status: 'completed',
      output,
      workspaceId: info.workspaceId,
      retryable: false,
    });
    return { result };
  } catch (err) {
    const message = (err as Error)?.message || 'workspace initialization failed';
    const result: ToolResult = {
      status: 'failed',
      error: message,
      errorCode: 'workspace_init_failed',
      retryable: false,
    };
    emitter.event('tool_result', {
      id: tc.id,
      name: 'initialize_workspace',
      ok: false,
      status: 'failed',
      output: '',
      error: message,
      errorCode: 'workspace_init_failed',
      retryable: false,
    });
    return { result };
  }
};
